import parser from "@typescript-eslint/parser";
export default [{ files:["**/*.{js,mjs,ts,tsx}"], ignores:["node_modules/**",".next/**","coverage/**"], languageOptions:{ parser, parserOptions:{ ecmaVersion:"latest", sourceType:"module", ecmaFeatures:{jsx:true} } } }];
