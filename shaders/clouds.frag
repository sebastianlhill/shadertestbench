#version 330 core
in vec2 vUV;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;

#define CLOUD_MAX 4000.0
#define CLOUD_MIN 1500.0 

#define MAX_STEPS 128




vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float perlin3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);

    float n000 = dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0));
    float n100 = dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0));
    float n010 = dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0));
    float n110 = dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0));
    float n001 = dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1));
    float n101 = dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1));
    float n011 = dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1));
    float n111 = dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1));

    return mix(
        mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
        mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
        u.z);
}

float worley3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float d = 8.0;
    for (int z = -1; z <= 1; ++z)
    for (int y = -1; y <= 1; ++y)
    for (int x = -1; x <= 1; ++x) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = hash3(i + g) * 0.5 + 0.5;
        d = min(d, length(g + o - f));
    }
    return d;                                          // ~[0,1]
}

float fbmPerlin3(vec3 p) {
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 5; ++i) { v += amp * perlin3(p); p *= 2.0; amp *= 0.5; }
    return v;
}
float fbmWorley3(vec3 p) {
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 4; ++i) { v += amp * (1.0 - worley3(p)); p *= 2.0; amp *= 0.5; }
    return v;
}

float remap(float x, float a, float b, float c, float d) {
    return c + (x - a) / (b - a) * (d - c);
}

float perlinWorley3(vec3 p) {
    float pn = fbmPerlin3(p) * 0.5 + 0.5;
    float wn = fbmWorley3(p);
    return remap(pn, 0.0, 1.0, wn - 1.0, 1.0);
}


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

float heightGradient(float y) {
  float h = (y - CLOUD_MIN) / (CLOUD_MAX - CLOUD_MIN);
  float bottomFade = smoothstep(0.0, 0.15, h);
  float topFade    = smoothstep(1.0, 0.70, h);

  return bottomFade * topFade;
}

float cloudDensity(vec3 p){

  float base = perlinWorley3(p * 0.0015);
  float detail = fbmWorley3(p * 0.01);
  float d = remap(base, detail - 1.0, 1.0, 0.0, 1.0);
  d *= heightGradient(p.y);
  d = remap(d, 0.5, 1.0, 0.0, 1.0);
  return clamp(d, 0.0, 1.0) * 0.06;
}


float density(vec3 x){
  return 0.01;
}
float inScatter(vec3 x){
  return 0.5;
}
void main() {
    vec2 uv = 2.0 * vUV - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;
    float time = u_time * 0.6;  
   
    vec3 camPos = vec3(20.0,18.0,-50.0);
    vec3 camX   = vec3( 1.0, 0.0, 0.0);
    vec3 camY   = vec3( 0.0, 1.0, 0.0);
    vec3 camZ   = vec3( 0.0, 0.0, 1.0);

    vec3 color  = vec3( 0.0, 0.0, 0.0);
    vec3 albedo = vec3( 0.0, 0.0, 0.0);
    vec3 background = vec3(0.0,0.0,1.0);
    // ray origin 
    vec3 ro = camPos;
    // ray direction, forward is pos z 
    vec3 rd = normalize(uv.x*camX + uv.y*camY + camZ);
    
    vec2 hit = rayBox(ro, rd, CLOUD_MIN, CLOUD_MAX);
    float tNear = hit.x;
    float tFar  = hit.y;
    
    float g = 0.0;
    // we start at 1.0, 100%. as we go through cloud, our transmittance decays
    float transmittance = 1.0;
    float stepSize = (tFar - tNear) / MAX_STEPS;

    float t = 0.0;
    vec3 x = vec3(0.0,0.0,0.0);
    float sigma_t = 0;
    float stepTrans = 0;
    float luminance = 0;

    if (tFar > 0.0) {
      for (int i = 0; i < MAX_STEPS; ++i){
        t = tNear + (i + 0.5) * stepSize; 
        x = ro + t * rd;
        sigma_t = cloudDensity(x);
        // transmittance over this segment 
        stepTrans = exp(-sigma_t * stepSize);
        // accumulate in scattered light 
        luminance += transmittance * (1.0 - stepTrans) * inScatter(x);
       
        transmittance *= stepTrans; 
        if (transmittance < 0.01) break; 
      }

      color = luminance + transmittance * background;
    }

    // Gamma correction
    color = pow(color, vec3(1.0/2.2)); // simple linear to gamma, exposure of 1.0
    fragColor = vec4(color, 1.0);
}
