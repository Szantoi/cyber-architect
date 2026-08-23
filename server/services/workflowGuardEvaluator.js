/**
 * Pure interpreter for the closed workflow guard AST. It deliberately has no
 * access to globals, database handles, `eval`, Function, regex execution or
 * template engines: a guard can only inspect JSON runtime context.
 */

function readContextPath(context, path) {
  let value = context;
  for (const segment of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) {
      return { exists: false, value: undefined };
    }
    value = value[segment];
  }
  return { exists: true, value };
}

function samePrimitive(left, right) {
  return left === right || (Number.isNaN(left) && Number.isNaN(right));
}

export function evaluateWorkflowGuard(guard, context = {}) {
  if (!guard) return true;

  switch (guard.op) {
    case 'all':
      return guard.conditions.every(condition => evaluateWorkflowGuard(condition, context));
    case 'any':
      return guard.conditions.some(condition => evaluateWorkflowGuard(condition, context));
    case 'not':
      return !evaluateWorkflowGuard(guard.condition, context);
    case 'exists':
      return readContextPath(context, guard.path).exists;
    case 'equals': {
      const current = readContextPath(context, guard.path);
      return current.exists && samePrimitive(current.value, guard.value);
    }
    case 'not_equals': {
      const current = readContextPath(context, guard.path);
      return current.exists && !samePrimitive(current.value, guard.value);
    }
    case 'in': {
      const current = readContextPath(context, guard.path);
      return current.exists && guard.values.some(value => samePrimitive(current.value, value));
    }
    case 'gt': {
      const current = readContextPath(context, guard.path);
      return current.exists && typeof current.value === 'number' && current.value > guard.value;
    }
    case 'gte': {
      const current = readContextPath(context, guard.path);
      return current.exists && typeof current.value === 'number' && current.value >= guard.value;
    }
    case 'lt': {
      const current = readContextPath(context, guard.path);
      return current.exists && typeof current.value === 'number' && current.value < guard.value;
    }
    case 'lte': {
      const current = readContextPath(context, guard.path);
      return current.exists && typeof current.value === 'number' && current.value <= guard.value;
    }
    default:
      // Schema validation accepts only the cases above. Failing closed here
      // keeps a malformed or manually-corrupted stored guard non-executable.
      return false;
  }
}
