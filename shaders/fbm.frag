#version 330 core
in vec2 vUV;
out vec4 fragColor;

uniform float u_resolution;
uniform float u_time;

// pseudo random 
float hash21(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
}
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x),
               mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}

// ---- fBm ----

float fbm ( in vec2 _st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial bias
    mat2 rot = mat2(cos(0.5), sin(0.5),
                    -sin(0.5), cos(0.50));
    for (int i = 0; i < 8; ++i) {
        v += a * vnoise(_st);
        _st = rot * _st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {

    vec2 p        = vUV;

    float t = u_time * 0.6;  

    vec2 driftQ  = vec2( cos(0.9),  sin(0.9) ) * 0.06 * t;   // up-right, slow
    vec2 driftR1 = vec2( cos(2.1),  sin(2.1) ) * 0.04 * t;   // down-left, slower
    vec2 driftR2 = vec2( cos(-0.6), sin(-0.6)) * 0.05 * t;   // up-left
    vec2 driftF  = vec2( cos(3.6),  sin(3.6) ) * 0.03 * t;   // slow counter-drift

    vec2 q = vec2(
        fbm(p + driftQ),
        fbm(p + vec2(5.2, 1.3) + driftQ * 0.7)
    );

    vec2 r = vec2(
        fbm(p + 1.0*q + vec2(1.7, 9.2) + driftR1),
        fbm(p + 1.0*q + vec2(8.3, 2.8) + driftR2)
    );

    float f = fbm(p + 1.5*r + driftF);

    float sBase = smoothstep(0.35, 0.65, f);
    float sRed  = smoothstep(0.35, 0.75, length(q));
    float sPink = smoothstep(0.30, 0.60, r.x);

    vec3 color = mix(vec3(1.0), vec3(0.42, 0.72, 0.96), sBase);
    color = mix(color, vec3(0.96, 0.42, 0.45), sRed);
    color = mix(color, vec3(1.0, 0.80, 0.87), sPink);

    float grad = length(vec2(dFdx(f), dFdy(f)));
    float contour = smoothstep(0.0, 0.02, grad);

    float band = 1.0 - smoothstep(0.0, 0.05, abs(f - 0.5));
    band = pow(band, 2.0);

    float edgeMask = clamp(contour + band * 0.5, 0.0, 1.0);
    color *= mix(1.0, 0.50, edgeMask);

    float shade = f*f*f + 0.6*f*f + 0.5*f;
    vec3 result = color * (shade * 1.9);
    result = mix(result, vec3(1.0), 0.10);

    fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
