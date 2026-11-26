/** Sistema de diseño AURA (sección 9): 60-30-10 + terracota como acento. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { canvas: "#FDFCFB", bone: "#F9F9F4", olive: "#656646", terracotta: "#B76044", beige: "#DDB8A9", ink: "#4A4A44" },
    borderRadius: { card: "12px", ctl: "8px" },
    boxShadow: { soft: "0 2px 8px rgba(221,184,169,0.35)" },
  } },
};
