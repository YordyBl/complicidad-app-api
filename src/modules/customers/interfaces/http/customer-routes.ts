/**
 * Customer Express router.
 *
 * Mounts customer CRUD and history endpoints on a single Router.
 * The controller handles request validation and response formatting.
 *
 * @openapi
 * /api/v1/customers:
 *   post:
 *     tags:
 *       - Customers
 *     summary: Create a customer
 *     description: Creates a new customer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               alias:
 *                 type: string
 *               address:
 *                 type: string
 *               googleMapsUrl:
 *                 type: string
 *               notes:
 *                 type: string
 *               district:
 *                 type: string
 *     responses:
 *       201:
 *         description: Customer created
 *       400:
 *         description: Validation error
 *
 *   get:
 *     tags:
 *       - Customers
 *     summary: List customers
 *     description: Returns a paginated list of customers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer list
 *
 * /api/v1/customers/{id}:
 *   get:
 *     tags:
 *       - Customers
 *     summary: Get customer by ID
 *     description: Returns a single customer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer details
 *       404:
 *         description: Customer not found
 *
 *   put:
 *     tags:
 *       - Customers
 *     summary: Update a customer
 *     description: Updates an existing customer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               alias:
 *                 type: string
 *               address:
 *                 type: string
 *               googleMapsUrl:
 *                 type: string
 *               notes:
 *                 type: string
 *               district:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Customer not found
 *
 * /api/v1/customers/{id}/history:
 *   get:
 *     tags:
 *       - Customers
 *     summary: Get customer history
 *     description: Returns customer purchase history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer history
 *       404:
 *         description: Customer not found
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
