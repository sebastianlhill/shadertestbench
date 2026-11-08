#version 330 core 

in vec2 vUV; 
out vec4 fragColor; 

uniform vec2 u_resolution; 
uniform float u_time; 

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}

float perlin(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);

  float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  return mix(mix(a,b, u.x), mix(c,d,u.x), u.y);
}

float worley(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d = 8.0;
  for (int y = -1; y <= 1; ++y)
    for (int x = -1; x <= 1; ++x){
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g) * 0.5 + 0.5;
      d = min(d, length(g + o - f));
    }
  return d;
}

float fbmPerlin(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; ++i) {
    v += amp * perlin(p);
    p *= 2.0; 
    amp *= 0.5;
  }
  return v; 
}
float fbmWorley(vec2 p) {
  float v = 0.0, amp = 0.5; 
  for (int i = 0; i < 4; ++i) {
    v += amp * ( 1.0  - worley(p));
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}


float remap(float x, float a, float b, float c, float d) {
  return c + (x - a) / (b - a) * (d - c);
}

float perlinWorley(vec2 p){
  float pn = fbmPerlin(p) * 0.5 + 0.5;
  float wn = fbmWorley(p);
  return remap(pn, 0.0, 1.0, wn -1.0, 1.0);
}

void main(){
  vec2 suv = gl_FragCoord.xy / u_resolution;
  vec2 q = fract(suv * 2.0);
  vec2 p = (q - 0.5) * 6.0;

  p += vec2(u_time * 0.05, 0);
  
  bool right = suv.x > 0.5;
  bool top   = suv.y > 0.5;
  float v; 
  if (top && !right){
    v = fbmPerlin(p * 4 ) * 0.5 + 0.5;
  } else if (top && right) {
    v = fbmWorley(p * 4 ) * 0.5 + 0.5;
  } else if (!top && !right) {
    v = clamp(perlinWorley(p), 0.0, 1.0);
  } else if (!top && right){
    float pw = clamp(perlinWorley(p), 0.0, 1.0);
    float detail = fbmWorley(p * 4.0);
    v = clamp(remap(pw, 0.0, 1.0, detail - 1.0, 1.0), 0.0, 1.0);
  }

  fragColor = vec4(vec3(v), 1.0);
}
