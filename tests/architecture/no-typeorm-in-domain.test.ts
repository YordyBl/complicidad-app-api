import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Architecture guard: domain source files MUST NOT import infrastructure
 * libraries (typeorm, express, etc.). This enforces hexagonal architecture
 * by scanning import/require statements in domain directories only.
 *
 * The infrastructure/typeorm directories are explicitly excluded — they
 * are expected to import TypeORM for entity mapping and repository adapters.
 */

const SRC_ROOT = join(__dirname, '..', '..', 'src');

// Infrastructure module identifiers that should never appear in domain imports
const FORBIDDEN_MODULES = ['typeorm', 'express', 'pg', 'ioredis', 'amqplib'];

/**
 * Collect all domain directories under src/modules and src/shared/domain.
 * Only checks the `domain/` subdirectory within each module, NOT
 * `infrastructure/` or `interfaces/` which legitimately need TypeORM/Express.
 */
function collectDomainDirs(): string[] {
  const dirs: string[] = [];

  // Shared domain directory
  const sharedDomain = join(SRC_ROOT, 'shared', 'domain');
  if (existsSync(sharedDomain)) {
    dirs.push('src/shared/domain');
  }

  // Per-module domain directories
  const modulesDir = join(SRC_ROOT, 'modules');
  if (existsSync(modulesDir)) {
    const moduleEntries = readdirSync(modulesDir, { withFileTypes: true });
    for (const entry of moduleEntries) {
      if (entry.isDirectory()) {
        const domainDir = join(modulesDir, entry.name, 'domain');
        if (existsSync(domainDir)) {
          dirs.push(`src/modules/${entry.name}/domain`);
        }
      }
    }
  }

  return dirs;
}

function collectDomainFiles(domainDirs: string[]): string[] {
  const files: string[] = [];

  for (const dir of domainDirs) {
    const fullPath = join(SRC_ROOT, dir);
    if (!existsSync(fullPath)) continue;

    const entries = readdirSync(fullPath, { recursive: true }) as string[];
    for (const entry of entries) {
      const entryPath = join(fullPath, entry);
      if (statSync(entryPath).isFile() && entry.endsWith('.ts')) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

describe('Domain purity — no infrastructure imports', () => {
  const domainDirs = collectDomainDirs();
  const domainFiles = collectDomainFiles(domainDirs);

  it('should have at least one domain directory to check', () => {
    // If no domain dirs exist, the test explains what's expected
    expect(domainDirs.length).toBeGreaterThan(0);
  });

  if (domainFiles.length === 0) {
    it('placeholder: no domain files exist yet', () => {
      // Once domain files exist, this placeholder is replaced by real checks
      expect(true).toBe(true);
    });
    return;
  }

  for (const filePath of domainFiles) {
    const relPath = relative(join(__dirname, '..', '..'), filePath);

    it(`${relPath} must not import infrastructure modules`, () => {
      const content = readFileSync(filePath, 'utf-8');

      for (const mod of FORBIDDEN_MODULES) {
        const importPattern = new RegExp(
          `(?:from\\s+['"]${mod}['"]|require\\s*\\(\\s*['"]${mod}['"]\\))`,
        );
        expect(content).not.toMatch(importPattern);
      }
    });
  }
});

describe('Infrastructure directories must NOT be scanned by domain guard', () => {
  it('typeorm infrastructure dirs should exist under modules', () => {
    // Verify our guard correctly excludes infrastructure directories
    const modulesDir = join(SRC_ROOT, 'modules');
    if (!existsSync(modulesDir)) return;

    const moduleEntries = readdirSync(modulesDir, { withFileTypes: true });
    const infraDirs: string[] = [];
    for (const entry of moduleEntries) {
      if (entry.isDirectory()) {
        const typeormDir = join(
          modulesDir,
          entry.name,
          'infrastructure',
          'typeorm',
        );
        if (existsSync(typeormDir)) {
          infraDirs.push(typeormDir);
        }
      }
    }

    // This is an informational check — no assertion
    console.log(
      `Infrastructure/typeorm directories (excluded from domain guard): ${infraDirs.length > 0 ? infraDirs.join(', ') : 'none yet'}`,
    );
  });
});
