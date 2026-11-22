export default {
  base: './',
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/examples/jsm')) {
            return 'three-addons';
          }
          if (id.includes('node_modules/three')) {
            return 'three-core';
          }
          if (id.includes('node_modules/peerjs')) {
            return 'peerjs';
          }
          return undefined;
        },
      },
    },
  },
};
