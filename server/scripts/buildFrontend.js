// Vite allows NODE_ENV from local dotenv files to influence dependency
// conditions. Force the production condition before importing Vite so local
// developer configuration cannot accidentally ship React's development build.
process.env.NODE_ENV = 'production';

const { build } = await import('vite');
await build();
