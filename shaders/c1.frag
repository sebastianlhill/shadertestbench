#version 330 core
in vec2 vUV;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;

#define CLOUD_MAX 4000.0
#define CLOUD_MIN 1500.0 

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// query when a ray intersects a box, returning near point and far point 
// we can then march over near and far, which saves alot of wasted marching 
vec2 rayBox(vec3 ro, vec3 rd, float boxMin, float boxMax) {
  // the box min and box max can be thought of as xz planes at some y value 
  // so we are looking for the intersection of the ray at those planes 
  
  // if the ray is parallel to planes, cant divide 
  if (abs(rd.y) < 1e-6) {
    if (ro.y >= boxMin && ro.y <= boxMax){
      // origin is between planes 
      return vec2(0.0, 1e20);
    }
    return vec2(-1.0, -1.0);
  }




  // ray formula 
  // p(t) = origin + (t * direction)
  float tBottom = (boxMin - ro.y) / rd.y;
  float tTop    = (boxMax - ro.y) / rd.y;

  // whether we are above cloud layer or below changes which is 
  // near and which is far 
  float tNear = min(tBottom, tTop);
  float tFar  = max(tBottom, tTop);
      
  if (tFar <= 0.0) return vec2(-1.0, -1.0);

  // Clamp near to 0 so we don't report hits behind the camera.
  tNear = max(tNear, 0.0); 
  
  // if plane is behind us, we dont use it  
  return vec2(tNear, tFar);
}

void main() {
    vec2 uv = 2.0 * vUV - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;
    float t = u_time * 0.6;  
   
    vec3 camPos = vec3(20.0,18.0,-50.0);
    vec3 camX   = vec3( 1.0, 0.0, 0.0);
    vec3 camY   = vec3( 0.0, 1.0, 0.0);
    vec3 camZ   = vec3( 0.0, 0.0, 1.0);

    vec3 color  = vec3( 0.0, 0.0, 0.0);
    vec3 albedo = vec3( 0.0, 0.0, 0.0);

    // ray origin 
    vec3 ro = camPos;
    // ray direction, forward is pos z 
    vec3 rd = normalize(uv.x*camX + uv.y*camY + camZ);
    
    vec2 hit = rayBox(ro, rd, CLOUD_MIN, CLOUD_MAX);
    float tNear = hit.x;
    float tFar  = hit.y;
    
    float g = 0.0;
    if (tFar > 0.0) {
      float pathLen = (tFar - tNear);          // ≈ slabThickness / |rd.y|
      float slabThickness = CLOUD_MAX - CLOUD_MIN;
      g = clamp(slabThickness / pathLen, 0.0, 1.0);   // = |rd.y|, essentially

    }

    // Gamma correction
    color = pow(color, vec3(1.0/2.2)); // simple linear to gamma, exposure of 1.0
    fragColor = vec4(vec3(g), 1.0);
}
