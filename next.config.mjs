/** @type {import('next').NextConfig} */
const nextConfig = {
  // ngrok free tier serves the app through a random host; allow it in dev.
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.app', '*.ngrok.io'],
};

export default nextConfig;
