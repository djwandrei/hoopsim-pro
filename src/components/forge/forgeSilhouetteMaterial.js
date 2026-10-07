// The silhouette remains black even at nine picks. Progress lights only a
// narrow grazing-angle edge, never the face or anatomical surface detail.
export function configureSilhouetteMaterial(material) {
  const rimStrength = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.forgeRimStrength = rimStrength;
    shader.fragmentShader = `uniform float forgeRimStrength;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float silhouetteEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 7.0);
      vec3 edgeTone = mix(vec3(0.13, 0.19, 0.28), vec3(0.55, 0.34, 0.08), forgeRimStrength);
      outgoingLight = vec3(0.002, 0.003, 0.005) + edgeTone * silhouetteEdge * 0.55;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'forge-reference-silhouette-v2';
  return rimStrength;
}