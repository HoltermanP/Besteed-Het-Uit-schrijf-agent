import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Server-side packages met native/dynamische requires niet mee-bundelen.
  serverExternalPackages: ['@prisma/client', 'officeparser', 'pdf-parse'],
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
