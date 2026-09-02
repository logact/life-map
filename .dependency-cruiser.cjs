/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-runtime-independent',
      comment: 'Domain code may only depend on other domain code.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/(?:application|infrastructure|ui)/' },
    },
    {
      name: 'application-does-not-depend-on-adapters-or-ui',
      comment: 'Application services depend inward on domain ports, never concrete adapters or UI.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^src/(?:infrastructure|ui)/' },
    },
    {
      name: 'infrastructure-does-not-depend-on-ui',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/ui/' },
    },
    {
      name: 'ui-must-not-use-repositories',
      comment: 'Only the composition root may construct repository adapters.',
      severity: 'error',
      from: {
        path: '^src/ui/',
        pathNot: '^src/ui/composition/',
      },
      to: {
        path: '^src/(?:infrastructure/|domain/[^/]+/repository/)',
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
