import esbuild from 'esbuild'

const handlers = ['company-enrich', 'write-draft', 'review-draft', 'rewrite-fragment', 'style-documents', 'writer-status', 'extract-text', 'analyze-intent', 'analyze-tender', 'tender-documents', 'lessons-learned', 'evaluate-project', 'select-lessons']

await Promise.all(
  handlers.map((name) =>
    esbuild.build({
      entryPoints: [`api-src/${name}.ts`],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: `api/${name}.js`,
      target: 'node20',
      logLevel: 'info',
      external: ['@prisma/client'],
    }),
  ),
)
