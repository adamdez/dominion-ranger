import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/leads', destination: '/pipeline', permanent: true },
      { source: '/deal-board', destination: '/pipeline?view=board', permanent: true },
      { source: '/assignment', destination: '/pipeline?filter=unassigned', permanent: true },
    ];
  },
};

export default nextConfig;
