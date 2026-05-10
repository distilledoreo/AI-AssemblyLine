import next from "eslint-config-next";

const config = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "storage/**"],
  },
];

export default config;
