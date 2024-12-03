import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

module.exports = {
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: 'http://localhost:80/:path*' // Adjust to match your Flask server
      }
    ]
  }
}

export default nextConfig;
