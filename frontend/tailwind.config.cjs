const config = {
  mode: "jit",
  content: ["./src/**/*.{html,js,svelte,ts}"],

  theme: {
    extend: {},
    cursor: {
      "ew-resize": "ew-resize",
      "e-resize": "e-resize",
      "w-resize": "w-resize",
      "crosshair": "crosshair",
      "grab": "grab"
    }
  },

  plugins: [],
};

module.exports = config;
