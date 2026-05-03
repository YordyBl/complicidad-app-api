/**
 * Customer Express router.
 *
 * Mounts customer CRUD and history endpoints on a single Router.
 * The controller handles request validation and response formatting.
 */
import { Router } from 'express';
import type { CustomerController } from './CustomerController.js';

export function createCustomerRouter(controller: CustomerController): Router {
  const router = Router({ mergeParams: true });

  router.post('/customers', (req, res) => {
    void controller.create(req, res);
  });

  router.get('/customers', (req, res) => {
    void controller.list(req, res);
  });

  router.get('/customers/:id', (req, res) => {
    void controller.getById(req, res);
  });

  router.put('/customers/:id', (req, res) => {
    void controller.update(req, res);
  });

  router.get('/customers/:id/history', (req, res) => {
    void controller.history(req, res);
  });

  return router;
}
