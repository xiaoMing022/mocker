/**
 * Optional code-side project registry.
 * Prefer creating projects in the console (config-managed).
 * Only register here when you need a custom createRouter().
 *
 * @type {Array<{
 *   slug: string,
 *   name: string,
 *   description?: string,
 *   defaultPort?: number,
 *   createRouter: () => import("express").Router
 * }>}
 */
export const projects = []
