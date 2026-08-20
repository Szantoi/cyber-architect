/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Körkörös függőségek szigorúan tiltottak a Clean Architecture szerint.',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'backend-cannot-import-frontend',
      severity: 'error',
      comment: 'A szerveroldali réteg nem importálhat kliensoldali React komponenseket.',
      from: {
        path: '^server'
      },
      to: {
        path: '^src'
      }
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Olyan fájlok, amelyeket senki nem importál és nem belépési pontok.',
      from: {
        orphan: true,
        pathNot: ['^src/main\\.jsx$', '^server/index\\.js$', '^scripts/', '^server/tests/', '\\.test\\.(js|jsx)$', 'vite\\.config\\.js$', 'vitest\\.config\\.js$', 'eslint\\.config\\.js$']
      },
      to: {}
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default']
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+'
      }
    }
  }
};
