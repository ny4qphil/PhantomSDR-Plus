import preprocess from "svelte-preprocess";

const config = {
  preprocess: [
    preprocess({
      postcss: true,
    }),
  ],
  integrity: true
};

export default config;
