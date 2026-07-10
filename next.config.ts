import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Prisma (native engine) en de documentparsers niet mee-bundelen: bundelen breekt
  // de pdfjs-assets van pdf-parse. De parsers worden lazy geïmporteerd in
  // extractDocumentText en hieronder expliciet in de functie-output meegenomen.
  serverExternalPackages: ['@prisma/client', 'officeparser', 'pdf-parse'],
  outputFileTracingIncludes: {
    '/api/extract-text': ['./node_modules/pdf-parse/**', './node_modules/officeparser/**'],
    '/api/style-documents': ['./node_modules/pdf-parse/**', './node_modules/officeparser/**'],
    '/api/tender-documents': ['./node_modules/pdf-parse/**', './node_modules/officeparser/**'],
  },
  async rewrites() {
    return [
      {
        source: '/api/tenderned/:path*',
        destination: 'https://www.tenderned.nl/papi/tenderned-rs-tns/:path*',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/schrijfstijl',
        destination: '/schrijfregels',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
