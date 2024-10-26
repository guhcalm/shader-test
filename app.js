const DOMComponents = new Map()
const ContextComponents = new Map()
const TextureComponents = new Map()
const GlobalUniformComponents = new Map([
  ['iTime', ['uniform1f', 0]],
  ['iResolution', ['uniform2fv', new Float32Array([0, 0])]],
  ['iMouse', ['uniform2fv', new Float32Array([0, 0])]],
  ['iCamera', ['uniform3fv', new Float32Array([0, 0, 0])]],
  ['iFrame', ['uniform1i', 0]]
])

const UpdateCameraSystem = () => {
  const iMouse = GlobalUniformComponents.get('iMouse')[1]
  const iResolution = GlobalUniformComponents.get('iResolution')[1]
  const iTime = GlobalUniformComponents.get('iTime')[1]
  const { PI, sin, cos } = Math
  const mix = (a, b, t) => (t < 0 ? a : t > 1 ? b : (1 - t) * a + t * b)
  const m = { x: (iMouse[0] - 0.5 * iResolution[0]) / iResolution[1], y: (iMouse[1] - 0.5 * iResolution[1]) / iResolution[1] }
  const theta = -m.x * PI * 2 - 1.5
  const radius = 55.5 || mix(2, 5.5, sin(iTime * 0.001) * 0.5 + 0.5)
  const iCamera = new Float32Array([radius * sin(theta), radius * mix(1, m.y, 0.7), radius * cos(theta)])
  GlobalUniformComponents.get('iCamera')[1] = iCamera
}

// FRONT BUFFER
{
  const canvas = document.querySelector('canvas')
  const { width, height } = document.documentElement.getBoundingClientRect()
  canvas.width = width
  canvas.height = height
  GlobalUniformComponents.get('iResolution')[1] = new Float32Array([width, height])
  canvas.onmousemove = ({ x, y }) => {
    y = canvas.height - y
    GlobalUniformComponents.get('iMouse')[1] = new Float32Array([x, y])
  }
  const gl = canvas.getContext('webgl2')
  gl.getExtension('EXT_color_buffer_float')
  gl.clearColor(0, 0, 0, 1)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  ContextComponents.set('Front-Buffer', gl)
}

const ClampedTexture = async (entity, url) => {
  const response = await fetch(url)
  const blob = await response.blob()
  const img = new Image()
  img.src = URL.createObjectURL(blob)
  await img.decode()
  const gl = ContextComponents.get('Front-Buffer')
  const id = TextureComponents.size
  const texture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + id)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
  TextureComponents.set(entity, { id, url, texture, img })
}

const RepeatedTexture = async (entity, url) => {
  const response = await fetch(url)
  const blob = await response.blob()
  const img = new Image()
  img.src = URL.createObjectURL(blob)
  await img.decode()
  const gl = ContextComponents.get('Front-Buffer')
  const id = TextureComponents.size
  const texture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + id)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
  TextureComponents.set(entity, { id, url, texture, img })
}
const Shader = (name, fragmentCode) => {
  const gl = ContextComponents.get('Front-Buffer')

  const vertices = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
  const indices = new Uint8Array([0, 1, 2, 2, 3, 0])

  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  const indexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * (32 / 8), 0)
  gl.enableVertexAttribArray(0)
  gl.bindVertexArray(null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

  const program = gl.createProgram()
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(
    vertexShader,
    `#version 300 es
      layout(location=0) in vec2 POSITION;
      out vec2 uv;

      void main() {
        gl_Position = vec4(POSITION, 0, 1);
        uv = POSITION * .5 + .5;
      }`
  )
  gl.compileShader(vertexShader)
  gl.attachShader(program, vertexShader)
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(
    fragmentShader,
    `#version 300 es
      precision mediump float;
      in vec2 uv;
      out vec4 FragColor;

      ${fragmentCode.trim()}

      void main() { FragColor = Pixel(uv); }`
  )
  gl.compileShader(fragmentShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.log({ v: gl.getShaderInfoLog(vertexShader), f: gl.getShaderInfoLog(fragmentShader) })

  gl.useProgram(program)
  for (const [texture, { id }] of TextureComponents) gl.uniform1i(gl.getUniformLocation(program, texture), id)
  for (const [uniform, [method, buffer]] of GlobalUniformComponents) gl[method](gl.getUniformLocation(program, uniform), buffer)
  gl.useProgram(null)

  const id = TextureComponents.size
  const texture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + id)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight)
  TextureComponents.set(name, { id, texture })

  const frameBuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  return () => {
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer)
    for (const [uniform, [method, buffer]] of GlobalUniformComponents) gl[method](gl.getUniformLocation(program, uniform), buffer)
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_BYTE, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindVertexArray(null)
    gl.useProgram(null)
  }
}
const PingPongShader = (name, fragmentCode) => {
  const gl = ContextComponents.get('Front-Buffer')

  const vertices = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
  const indices = new Uint8Array([0, 1, 2, 2, 3, 0])

  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  const indexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * (32 / 8), 0)
  gl.enableVertexAttribArray(0)
  gl.bindVertexArray(null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

  const program = gl.createProgram()
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(
    vertexShader,
    `#version 300 es
      layout(location=0) in vec2 POSITION;
      out vec2 uv;

      void main() {
        gl_Position = vec4(POSITION, 0, 1);
        uv = POSITION * .5 + .5;
      }`
  )
  gl.compileShader(vertexShader)
  gl.attachShader(program, vertexShader)
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(
    fragmentShader,
    `#version 300 es
      precision mediump float;
      in vec2 uv;
      out vec4 FragColor;

      ${fragmentCode.trim()}

      void main() { FragColor = Pixel(uv); }`
  )
  gl.compileShader(fragmentShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.log({ v: gl.getShaderInfoLog(vertexShader), f: gl.getShaderInfoLog(fragmentShader) })

  const id = TextureComponents.size
  TextureComponents.set(name, { id })

  const pingTexture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + id)
  gl.bindTexture(gl.TEXTURE_2D, pingTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight)

  const pingFrameBuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, pingFrameBuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pingTexture, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const pongTexture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, pongTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight)

  const pongFrameBuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, pongFrameBuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pongTexture, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  gl.useProgram(program)
  for (const [texture, { id }] of TextureComponents) gl.uniform1i(gl.getUniformLocation(program, texture), id)
  for (const [uniform, [method, buffer]] of GlobalUniformComponents) gl[method](gl.getUniformLocation(program, uniform), buffer)
  gl.useProgram(null)

  let readFramebuffer = pingFrameBuffer
  let writeFramebuffer = pongFrameBuffer
  let readTexture = pingTexture
  let writeTexture = pongTexture

  return () => {
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFramebuffer)
    gl.activeTexture(gl.TEXTURE0 + id)
    gl.bindTexture(gl.TEXTURE_2D, readTexture)
    for (const [uniform, [method, buffer]] of GlobalUniformComponents) gl[method](gl.getUniformLocation(program, uniform), buffer)
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_BYTE, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindVertexArray(null)
    gl.useProgram(null)
    ;[readFramebuffer, writeFramebuffer] = [writeFramebuffer, readFramebuffer]
    ;[readTexture, writeTexture] = [writeTexture, readTexture]
  }
}
const Pixel = fragmentCode => {
  const gl = ContextComponents.get('Front-Buffer')

  const vertices = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])
  const indices = new Uint8Array([0, 1, 2, 2, 3, 0])

  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  const indexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * (32 / 8), 0)
  gl.enableVertexAttribArray(0)
  gl.bindVertexArray(null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

  const program = gl.createProgram()
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(
    vertexShader,
    `#version 300 es
    layout(location=0) in vec2 POSITION;
    out vec2 uv;

    void main() {
      gl_Position = vec4(POSITION, 0, 1);
      uv = POSITION * .5 + .5;
    }`
  )
  gl.compileShader(vertexShader)
  gl.attachShader(program, vertexShader)
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(
    fragmentShader,
    `#version 300 es
        precision mediump float;
        in vec2 uv;
        out vec4 FragColor;

        ${fragmentCode.trim()}

        void main()	{ FragColor = Pixel(uv); }`
  )
  gl.compileShader(fragmentShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.log({ v: gl.getShaderInfoLog(vertexShader), f: gl.getShaderInfoLog(fragmentShader) })

  gl.useProgram(program)
  for (const [texture, { id }] of TextureComponents) gl.uniform1i(gl.getUniformLocation(program, texture), id)
  for (const [uniform, [method, buffer]] of GlobalUniformComponents) gl[method](gl.getUniformLocation(program, uniform), buffer)
  gl.useProgram(null)

  return () => {
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    for (const [uniform, [method, buffer]] of GlobalUniformComponents) gl[method](gl.getUniformLocation(program, uniform), buffer)
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_BYTE, 0)
    gl.bindVertexArray(null)
    gl.useProgram(null)
  }
}

await ClampedTexture('ENVIRONMENT_TEXTURE', './envmap.jpg')
await ClampedTexture('BASEMAP_TEXTURE', './basemap.jpg')
await ClampedTexture('BATHMETRY_TEXTURE', './bathmetry.jpg')
await ClampedTexture('TOPOGRAPHY_TEXTURE', './topography.jpg')
await RepeatedTexture('WAVE_A_TEXTURE', './wave_a.png')
await RepeatedTexture('WAVE_B_TEXTURE', './wave_b.png')

const brdf = Shader(
  'BRDF_BUFFER',
  `float RadicalInverse_VdC(uint bits)  {
     bits = (bits << 16u) | (bits >> 16u);
     bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
     bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
     bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
     bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
     return float(bits) * 2.3283064365386963e-10;
  }
  vec2 Hammersley(uint i, uint N) { return vec2(float(i) / float(N), RadicalInverse_VdC(i)); }
  vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
    const float PI = radians(180.);
    float a = roughness*roughness;
    float phi = 2.0 * PI * Xi.x;
    float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
    float sinTheta = sqrt(1.0 - cosTheta*cosTheta);
    vec3 H;
    H.x = cos(phi) * sinTheta;
    H.y = sin(phi) * sinTheta;
    H.z = cosTheta;
    vec3 up = abs(N.z) < 0.999 ? vec3(0, 0, 1) : vec3(1, 0, 0);
    vec3 tangent = normalize(cross(up, N));
    vec3 bitangent = cross(N, tangent);  
    vec3 sampleVec = tangent * H.x + bitangent * H.y + N * H.z;
    return normalize(sampleVec);
  }
  float GeometrySchlickGGX(float NdotV, float roughness) {
    float a = roughness;
    float k = (a * a) / 2.0;
    float nom   = NdotV;
    float denom = NdotV * (1.0 - k) + k;
    return nom / denom;
  }
  float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = GeometrySchlickGGX(NdotV, roughness);
    float ggx1 = GeometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
  }

  vec2 BRDF(vec2 uv) {
    float NdotV = uv.x;
    float roughness = uv.y;
    vec3 V = vec3(sqrt(1. - pow(NdotV, 2.)), 0, NdotV);
    float A = 0.;
    float B = 0.; 
    vec3 N = vec3(0, 0, 1);
    const uint SAMPLE_COUNT = 1024u;
    for(uint i = 0u; i < SAMPLE_COUNT; ++i) {
      vec2 Xi = Hammersley(i, SAMPLE_COUNT);
      vec3 H = ImportanceSampleGGX(Xi, N, roughness);
      vec3 L = normalize(2.0 * dot(V, H) * H - V);
      float NdotL = max(L.z, 0.0);
      float NdotH = max(H.z, 0.0);
      float VdotH = max(dot(V, H), 0.0);
      if(NdotL > 0.) {
        float G = GeometrySmith(N, V, L, roughness);
        float G_Vis = (G * VdotH) / (NdotH * NdotV);
        float Fc = pow(1.0 - VdotH, 5.0);
        A += (1. - Fc) * G_Vis;
        B += Fc * G_Vis;
      }
    }
    return vec2(A, B) / float(SAMPLE_COUNT);
  }

  vec4 Pixel(vec2 uv) { return vec4(BRDF(uv), 0, 0); }`
)

const irradiance = Shader(
  'IRRADIANCE_BUFFER',
  `uniform vec2 iResolution;
  uniform vec2 iMouse;
  uniform float iTime;
  uniform highp sampler2D ENVIRONMENT_TEXTURE;

  vec3 uvToSphere(vec2 uv) {
    const float PI = radians(180.);
    float phi = (uv.x * 2.0 * PI) - PI;
    float theta = PI * (1.0 - uv.y);
    float x = sin(theta) * cos(phi);
    float y = cos(theta);
    float z = sin(theta) * sin(phi);
    return vec3(x, y, z);
  }
  vec2 sphereToUv(vec3 direction) {
    const float PI = radians(180.);
    float phi = atan(direction.z, direction.x);
    float theta = acos(direction.y);
    float u = (phi + PI) / (2.0 * PI);
    float v = theta / PI;
    return vec2(u, 1. - v);
  }
    
  /* Irradiance Map */
  float seed;
  float random() { return fract(sin(seed += .1) * 4568.7564); }
  vec3 RandomVectorOnHemisphere(vec3 normal) {
    float u = random();
    float v = random();
    float a = 6.283185 * v;
    float b = u * 2. - 1.;
    vec3 random = vec3(sqrt(1. - b * b) * vec2(cos(a), sin(a)), b);
    return normalize(random * sign(dot(normal, random)));
  }

  #define Environmentmap(direction) texture(ENVIRONMENT_TEXTURE, sphereToUv(RandomVectorOnHemisphere(direction))).rgb
  vec3 Irradiance(vec2 uv) {
    vec3 normal = uvToSphere(uv);
    const int STEPS = 600;
    vec3 color;
    for (int i; i < STEPS; i++) color += Environmentmap(normal);
    return color / float(STEPS);
  }

  vec4 Pixel(vec2 uv) { return vec4(Irradiance(uv), 0); }`
)

const radiance = Shader(
  'RADIANCE_BUFFER',
  `uniform vec2 iResolution;
  uniform vec2 iMouse;
  uniform float iTime;
  uniform highp sampler2D ENVIRONMENT_TEXTURE;

  const int samples = 200;
  const int LOD = 2;        
  const int sLOD = 1 << LOD;
  const float sigma = float(samples) * .25;

  float gaussian(vec2 i) { return exp( -.5* dot(i/=sigma,i) ) / ( 6.28 * sigma*sigma ); }

  vec4 Gaussianblur(highp sampler2D sp, vec2 U, vec2 scale) {
    vec4 O = vec4(0);  
    int s = samples/sLOD;
      
    for ( int i = 0; i < s*s; i++ ) {
      vec2 d = vec2(i%s, i/s)*float(sLOD) - float(samples)/2.;
      O += gaussian(d) * textureLod( sp, U + scale * d , float(LOD) );
    }
      
    return O / O.a;
  }

  vec4 Pixel(vec2 uv) {
    return Gaussianblur( ENVIRONMENT_TEXTURE, uv, 1./ iResolution.xy );
  }`
)

const elevation = Shader(
  'ELEVATION_BUFFER',
  `uniform highp sampler2D TOPOGRAPHY_TEXTURE;
  uniform highp sampler2D BATHMETRY_TEXTURE;

  vec2 MercatorToWgs84(vec2 mercator) {
    const float PI = 3.14159265359;
    float longitude = 2. * PI * mercator.x - PI;
    float latitude = 2. * atan(exp(((1. - mercator.y) - .5) * 2. * PI)) - PI / 2.;
    float u = (longitude + PI) / (2. * PI);
    float v = 1. - (latitude + (PI / 2.)) / PI;
    return vec2(u, v);
  }

  float Elevation(vec2 uv) {
    float bathmetry = (texture(BATHMETRY_TEXTURE, uv).r);
    float topography = (texture(TOPOGRAPHY_TEXTURE, uv).r);
    const float EVEREST = 8000.;
    const float MARIANAS = -11000.;
    return ((topography * EVEREST + (1. - bathmetry) * MARIANAS) - MARIANAS) / (EVEREST - MARIANAS);
  }

  vec4 Pixel(vec2 uv) {
    vec2 wgs = MercatorToWgs84(uv);
    float elevation = Elevation(uv);
    return vec4(vec3(elevation), 1);
  }`
)

const jumpFlooding = PingPongShader(
  'JUMP_FLOODING_BUFFER',
  `uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D JUMP_FLOODING_BUFFER;
  uniform int iFrame;
  uniform vec2 iResolution;

  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;
  const float OCEAN_RADIUS = mix(MARIANAS_RADIUS, EVEREST_RADIUS, .8);

  /* Jump Flooding on Heightmap */

  vec4 JumpFlooding(ivec2 ij, float seed) {
    const int STEP_FRAMES = 30;
    const int N = 9;  
    int jump_size = (1 << N) >> min(iFrame/STEP_FRAMES, N); 
    float current_dist = 9e9;
    vec2 current_offset = vec2(0);
    float current_fill = 0.;
    if(iFrame == 0) return vec4(0, 0, 0, seed);
    for(int x = -1; x <= 1; ++x)
    for(int y = -1; y <= 1; ++y) {
      ivec2 jump = jump_size * ivec2(x,y);
      ivec2 coord = ij + jump;
      if(coord.x < 0 || coord.y < 0 || coord.x >= int(iResolution.x) || coord.y >= int(iResolution.y)) continue;
      vec4 samp = texelFetch(JUMP_FLOODING_BUFFER, coord, 0);
      bool samp_fill = samp.a >= 1.;
      vec2 samp_offset = samp.rg;
      vec2 candidate_offset = vec2(jump) + samp_offset;
      float candidate_dist = length(candidate_offset);
      if (candidate_dist <= current_dist && samp_fill) {
        current_dist = candidate_dist;
        current_offset = candidate_offset;
        current_fill = 1.;
      }
    }
    return vec4(current_offset, 0., current_fill);
  }


  vec4 Pixel(vec2 uv) {
    ivec2 ij = ivec2(gl_FragCoord.xy);
    float elevation = texture(ELEVATION_BUFFER, uv).r;
    float seed = mix(-11000., 8000., elevation) >= 0. ? 1. : 0.;
    return JumpFlooding(ij, seed);
  }`
)

const normals = Shader(
  'NORMAL_BUFFER',
  `uniform highp sampler2D ELEVATION_BUFFER;

  struct Ray { vec3 origin; vec3 direction; };
    
  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = EVEREST_RADIUS - .1;

  vec3 uvToSphere(vec2 uv) {
    const float PI = radians(180.);
    float phi = ((1. - uv.x) * 2.0 * PI) - PI;
    float theta = PI * (1.0 - uv.y);
    float x = sin(theta) * cos(phi);
    float y = cos(theta);
    float z = sin(theta) * sin(phi);
    return vec3(x, y, z);
  }
  vec2 sphereToUv(vec3 direction) {
    const float PI = radians(180.);
    float phi = atan(direction.z, direction.x);
    float theta = acos(direction.y);
    float u = (phi + PI) / (2.0 * PI);
    float v = theta / PI;
    return vec2(1. -u, 1. - v);
  }

  /* SDF's */
  #define Elevationmap(uv) texture(ELEVATION_BUFFER, uv).r
  float PlanetSDF(vec3 position) {
    vec2 coord = sphereToUv(normalize(position));
    float elevation = Elevationmap(coord);
    float radius = mix(MARIANAS_RADIUS, EVEREST_RADIUS, elevation);
    return length(position) - radius;
  }
  float SDF(in vec3 p) { return PlanetSDF(p * .9) * .1; }

  vec4 Pixel(vec2 uv) {
    vec3 direction = uvToSphere(uv);
    float elevation = Elevationmap(uv);
    vec3 position = direction * mix(MARIANAS_RADIUS * .5, EVEREST_RADIUS, elevation);
    vec2 e = vec2(.004, 0);
    vec3 normal = normalize(vec3(
      SDF(position + e.xyy) - SDF(position - e.xyy),
      SDF(position + e.yxy) - SDF(position - e.yxy),
      SDF(position + e.yyx) - SDF(position - e.yyx)
    ));
    return vec4(vec3(normal), 1.);
  }`
)

const view = Shader(
  'VIEW_BUFFER',
  `uniform vec2 iResolution;
  uniform vec2 iMouse;
  uniform vec3 iCamera;

  /* Panini Camera */
  vec3 CameraDirection(vec2 uv) {
    vec3 origin = iCamera;
    float focalLength;
    vec3 target;
    float aspect = iResolution.x / iResolution.y;
    vec3 ndc = vec3(uv * 2.0 - 1.0, 1.0);
    const float fov = radians(20.);
    const vec3 up = vec3(0, 1, 0);
    float f = tan(fov / 2.0);
    vec3 screen = vec3(ndc.x * aspect * f, ndc.y * f, ndc.z / f);
    float d = sqrt(1.0 + screen.x * screen.x + screen.y * screen.y);
    float u = screen.x / (screen.z + d * focalLength);
    float v = screen.y / (screen.z + d * focalLength);
    vec3 paniniScreen = normalize(vec3(u, v, 1.0));  
    vec3 w = normalize(target - origin);
    vec3 uAxis = normalize(cross(w, up));
    vec3 vAxis = normalize(cross(uAxis, w));
    return normalize(mat3(uAxis, vAxis, w) * paniniScreen);
  }

  vec4 Pixel(vec2 uv) { return vec4(CameraDirection(uv), 0); }`
)

const geometry = Shader(
  'GEOMETRY_BUFFER',
  `uniform vec3 iCamera;
  uniform float iTime;
  uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D VIEW_BUFFER;

  struct Ray { vec3 origin; vec3 direction; };
    
  const float EPSILON = .001;
  const float NEAR = .001;
  const float FAR = 100.;
  const vec3 PLANET_POSITION = vec3(0);
  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;

  #define Camera(uv) Ray(iCamera, texture(VIEW_BUFFER, uv).xyz)
  vec3 uvToSphere(vec2 uv) {
    const float PI = radians(180.);
    float phi = (uv.x * 2.0 * PI) - PI;
    float theta = PI * (1.0 - uv.y);
    float x = sin(theta) * cos(phi);
    float y = cos(theta);
    float z = sin(theta) * sin(phi);
    return vec3(x, y, z);
  }
  vec2 sphereToUv(vec3 direction) {
    const float PI = radians(180.);
    float phi = atan(direction.z, direction.x);
    float theta = acos(direction.y);
    float u = (phi + PI) / (2.0 * PI);
    float v = theta / PI;
    return vec2(1. -u, 1. - v);
  }

  /* SDF's */
  vec2 SphereBoundary(Ray camera, float radius) {
    vec3 position;
    vec3 direction = camera.origin - position;
    float a = dot(camera.direction, camera.direction);
    float b = 2. * dot(direction, camera.direction);
    float c = dot(direction, direction) - radius * radius;
    float discriminant = b * b - 4. * a * c;
    if (discriminant <= 0.) return vec2(FAR);
    float distanceA = (-b - sqrt(discriminant)) / (2. * a);
    float distanceB = (-b + sqrt(discriminant)) / (2. * a);
    if (distanceA < 0.) return vec2(FAR, distanceB); 
    return vec2(distanceA, distanceB);
  }
 
  #define Elevationmap(uv) texture(ELEVATION_BUFFER, uv).r
  float PlanetSDF(in vec3 position) {
    vec3 normal = - normalize(position);
    vec2 uv = sphereToUv(normalize(position));
    float bump = Elevationmap(uv);
    float radius = mix(MARIANAS_RADIUS, EVEREST_RADIUS, bump);
    float d = length(position) - radius;
    return d * .1;
  }
  float SDF(in vec3 p) { return PlanetSDF(p); }

  /* Distance */
  float RayMarcher(Ray camera, float distance) {
    for(int steps; steps < 600; steps++) {
      if (distance >= FAR) break;
      float march = SDF(camera.origin + camera.direction * distance) * .1;
      if (abs(march) <= NEAR) return distance;
      distance += march;
      if (distance >= FAR) break;
    }
    return FAR;
  }

  struct Light { vec3 direction; vec3 color; };
  const Light SUN = Light(normalize(vec3(1, 1, -1)), vec3(1));

  float SoftShadows(vec3 position, Light light) {
    float k = 16.;
    float res = 1.;
    float t = .1;
    float ph = 1e10;
    for(int i = 0; i < 64; i++) {
    float h = SDF(position + light.direction * t);
      float y = h * h / (2. * ph);
      float d = sqrt(h * h - y * y);
      res = min(res, k * d / max(0., t - y));
      ph = h;    
      t += h;
      if(res < .001 || t > 16.) break;
    }
    res = clamp(res, 0., 1.);
    return res * res * (3. - 2. * res);
  }

  vec4 Pixel(vec2 uv) {
    Ray camera = Camera(uv);
    vec2 boundary = SphereBoundary(camera, EVEREST_RADIUS);
    float distance = RayMarcher(camera, boundary.x);
    float depth = distance / FAR;
    vec3 position = camera.origin + camera.direction * distance;
    float shadows = SoftShadows(position, SUN);
    return vec4(vec3(depth), shadows);
  }`
)

const light = Shader(
  'PATH_TRACED_BUFFER',
  `uniform vec3 iCamera;
  uniform float iTime;
  uniform highp sampler2D ENVIRONMENT_TEXTURE;
  uniform highp sampler2D BASEMAP_TEXTURE;
  uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D BRDF_BUFFER;
  uniform highp sampler2D IRRADIANCE_BUFFER;
  uniform highp sampler2D RADIANCE_BUFFER;
  uniform highp sampler2D NORMAL_BUFFER;
  uniform highp sampler2D VIEW_BUFFER;
  uniform highp sampler2D GEOMETRY_BUFFER;
  uniform highp sampler2D WAVE_A_TEXTURE;
  uniform highp sampler2D WAVE_B_TEXTURE;
  uniform highp sampler2D JUMP_FLOODING_BUFFER;

  struct Ray { vec3 origin; vec3 direction; };
  struct Light { vec3 direction; vec3 color; };
  struct Geometry { vec3 position; vec3 normal; float distance; vec2 coord; float path; };
  struct Material { vec3 albedo; float roughness; float metallic; float reflectance; };

  const float PI = radians(180.);
  const vec3 PLANET_POSITION = vec3(0);
  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;
  const float OCEAN_RADIUS = mix(MARIANAS_RADIUS, EVEREST_RADIUS, .8);
  const float ATMOSPHERE_RADIUS = EVEREST_RADIUS + .1;

  #define saturate(value) clamp(value, 0., 1.)
  #define GammaExpansion(color) pow(vec3(color), vec3(2.2))
  #define GammaCompression(color) pow(vec3(color), vec3(1. / 2.2))
  #define EncodeVec2(xy) uintBitsToFloat(packHalf2x16(xy))
  #define DecodeVec2(packedFloat) unpackHalf2x16(floatBitsToUint(packedFloat))
  #define Camera(uv) Ray(iCamera, texture(VIEW_BUFFER, uv).xyz)
    
  const Light SUN = Light(normalize(vec3(1, 1, -1)), vec3(1));
  const float NEAR = .001;
  const float FAR = 100.;
  const Geometry DEFAULT_GEOMETRY = Geometry(vec3(0), vec3(0), FAR, vec2(0), 0.);

  vec2 sphereToUv(vec3 direction) {
    float phi = atan(direction.z, direction.x);
    float theta = acos(direction.y);
    float u = (phi + PI) / (2.0 * PI);
    float v = theta / PI;
    return vec2(1. - u, 1. - v);
  }
  vec3 uvToSphere(vec2 uv) {
    float phi = ((1. - uv.x) * 2.0 * PI) - PI;
    float theta = PI * (1.0 - uv.y);
    float x = sin(theta) * cos(phi);
    float y = cos(theta);
    float z = sin(theta) * sin(phi);
    return vec3(x, y, z);
  }

  Geometry PlanetGeometry(vec2 uv, Ray camera) {
    float depth = texture(GEOMETRY_BUFFER, uv).r;
    float distance = depth * FAR;
    if (depth >= .9) return DEFAULT_GEOMETRY;
    vec3 position = camera.origin + camera.direction * distance;
    vec2 coord = sphereToUv(normalize(position));
    vec3 normal = texture(NORMAL_BUFFER, coord).rgb;
    return Geometry(position, normal, distance, coord, 0.);
  }

  vec2 SphereBoundary(Ray camera, float radius) {
    vec3 position;
    vec3 direction = camera.origin - position;
    float a = dot(camera.direction, camera.direction);
    float b = 2. * dot(direction, camera.direction);
    float c = dot(direction, direction) - radius * radius;
    float discriminant = b * b - 4. * a * c;
    if (discriminant <= 0.) return vec2(FAR);
    float distanceA = (-b - sqrt(discriminant)) / (2. * a);
    float distanceB = (-b + sqrt(discriminant)) / (2. * a);
    if (distanceA < 0.) return vec2(FAR, distanceB); 
    return vec2(distanceA, distanceB);
  }
  Geometry OceanGeometry(Ray camera) {
    vec2 boundary = SphereBoundary(camera, OCEAN_RADIUS);
    float distance = boundary.x;
    if (distance >= FAR) return DEFAULT_GEOMETRY;
    vec3 position = camera.origin + camera.direction * distance;
    vec2 coord = sphereToUv(normalize(position));
    vec3 normal = normalize(position);
    float path = abs(boundary.y - boundary.x);
    return Geometry(position, normal, distance, coord, path);
  }
  Geometry AtmosphereGeometry(Ray camera) {
    vec2 boundary = SphereBoundary(camera, ATMOSPHERE_RADIUS);
    float distance = boundary.x;
    if (distance >= FAR) return DEFAULT_GEOMETRY;
    vec3 position = camera.origin + camera.direction * distance;
    vec2 coord = sphereToUv(normalize(position));
    vec3 normal = normalize(position);
    float path = abs(boundary.y - boundary.x);
    return Geometry(position, normal, distance, coord, path);
  }

  float AmbientOcclusion(vec2 uv, Geometry geometry, float intensity) {
    const float SCALE = .1;
    const float BIAS = 0.01;
    const float DIS_CONSTRAINT = 3.5;
    Ray camera = Camera(uv);
    vec3 diff = PlanetGeometry(uv, camera).position - geometry.position;
    vec3 v = normalize(diff);
    float d = length(v) * SCALE;
    float ao = max(0.0, dot(geometry.normal, v) - BIAS) * (1.0 / (1.0 + d)) * intensity;
    float l = length(diff);
    return ao * smoothstep(DIS_CONSTRAINT, DIS_CONSTRAINT * 0.5, l);
  }
  float seed;
  float random() { return fract(sin(seed += .1) * 4568.7564); }
  float random(vec2 uv) { 
    seed++;
    return fract(sin(seed+dot(uv, vec2(127.1, 311.7))) * 4568.7564);
  }
  float SSAO(vec2 uv, Ray camera, Geometry geometry) {
    const float INTENSITY = 1.;
    vec2 random = normalize(vec2(random(uv), random(uv)));
    const vec2 dire[4] = vec2[](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0,-1));
    const float SAMPLE_RAD = 0.1;
    float ssao;
    int iterations = 4;
    for(int i; i < iterations; i++) {
      vec2 coord1 = reflect(dire[i], random) * SAMPLE_RAD;
      vec2 coord2 = vec2(coord1.x * cos(radians(45.0)) - coord1.y * sin(radians(45.0)), coord1.x * cos(radians(45.0)) + coord1.y * sin(radians(45.0)));
      ssao += AmbientOcclusion(uv + coord1 * 0.25, geometry, INTENSITY);
      ssao += AmbientOcclusion(uv + coord2 * 0.5, geometry, INTENSITY);
      ssao += AmbientOcclusion(uv + coord1 * 0.75, geometry, INTENSITY);
      ssao += AmbientOcclusion(uv + coord2, geometry, INTENSITY);
    }
    ssao = ssao / (float(iterations) * 4.);
    ssao = 1. - ssao * INTENSITY;
    return ssao
      * pow(ssao, .0001)
      * pow(ssao, .001)
      * pow(ssao, .01)
      * pow(ssao, .1)
      * pow(ssao, 1.)
      * pow(smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,ssao)))))))), 4.)
      * pow(smoothstep(0., 1.,smoothstep(0., 1.,smoothstep(0., 1.,ssao))), 3.)
      * pow(smoothstep(0., 1.,smoothstep(0., 1.,ssao)), 2.)
      * pow(pow(ssao, 100.), .05)
      * mix(.5, 1., pow(pow(ssao, 1000.), .1));
  }

  vec3 TurboColorPallete(float t) {
    t = clamp(0., 1., t);
    const vec3 c0 = vec3(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
    const vec3 c1 = vec3(6.716419496985708, 3.182286745507602, 7.571581586103393);
    const vec3 c2 = vec3(-66.09402360453038, -4.9279827041226, -10.09439367561635);
    const vec3 c3 = vec3(228.7660791526501, 25.04986699771073, -91.54105330182436);
    const vec3 c4 = vec3(-334.8351565777451, -69.31749712757485, 288.5858850615712);
    const vec3 c5 = vec3(218.7637218434795, 67.52150567819112, -305.2045772184957);
    const vec3 c6 = vec3(-52.88903478218835, -21.54527364654712, 110.5174647748972);
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
  }

  vec3 IBL(in Ray camera, in Geometry geometry, in Material material, in float ao) {
    #define Irradiance(normal) texture(IRRADIANCE_BUFFER, sphereToUv(normal)).rgb
    #define BluryRadiance(direction) texture(RADIANCE_BUFFER, sphereToUv(direction)).rgb
    #define OriginalRadiance(direction) texture(ENVIRONMENT_TEXTURE, sphereToUv(direction)).rgb
    #define Brdf(NdotV, roughness) texture(BRDF_BUFFER, vec2(NdotV, roughness)).rg
      
    vec3 V = -camera.direction;
    vec3 N = geometry.normal;
    vec3 R = reflect(-V, N);

    vec3 albedo = material.albedo;
    float metallic = clamp(material.metallic, 0., 1.);
    float roughness = clamp(material.roughness, .1, 1.);
    float reflectance = material.reflectance;
    vec3 F0 = mix(vec3(reflectance), albedo, metallic);
  
    float NdotV = clamp(dot(N, V), 0., 1.);
    vec2 brdf = Brdf(NdotV, roughness);
    vec3 fresnel = saturate(F0 * brdf.r + brdf.g);
    vec3 irradiance = Irradiance(N);
    vec3 radiance = mix(OriginalRadiance(R), BluryRadiance(R), fresnel);
    vec3 diffuse = albedo * (irradiance * irradiance + irradiance);
    vec3 specular = radiance * radiance + radiance;

    return GammaExpansion(mix(diffuse, specular, fresnel)) * ao;
  }

  vec3 Environment(vec3 direction) {
    vec3 color = texture(ENVIRONMENT_TEXTURE, sphereToUv(direction)).rgb;
    return color * color + color;
  }

  const float INFINITY = 9999.;

  float AtmosphereDensity(vec3 position) {
    const float DENSITY_FALLOFF = 3.0;
    float heightAboveSurface = length(position - PLANET_POSITION) - (EVEREST_RADIUS);
    float height01 = heightAboveSurface / (ATMOSPHERE_RADIUS - EVEREST_RADIUS);
    return exp(-height01 * DENSITY_FALLOFF) * (1. - height01);
  }
  float AtmosphereOpticalDepth(Ray ray, float path) {
    const int OUTSCATTER_POINTS = 10;
    vec3 densitySamplePoint = ray.origin;
    float stepSize = path / float(OUTSCATTER_POINTS - 1);
    float opticalDepth;
    for (int i = 0; i < OUTSCATTER_POINTS; i++) {
    opticalDepth += AtmosphereDensity(densitySamplePoint) * stepSize;
    densitySamplePoint += ray.direction * stepSize;
    }
    return opticalDepth;
  }
  vec3 AtmosphereLight(Ray camera, in float path) {
    const int INSCATTER_POINTS = 10;
    const vec3 WAVE_LENGTHS = vec3(750.0, 530.0, 400.0);
    const float SCATTERING_STRENGTH = 15.0;
    const vec3 SCATTERING_COEFFICIENTS = pow(400.0 / WAVE_LENGTHS, vec3(4.0)) * SCATTERING_STRENGTH;
    vec3 inScatterPoint = camera.origin;
    vec3 inScatteredLight;
    float stepSize = path / float(INSCATTER_POINTS - 1);
    for (int i = 0; i < INSCATTER_POINTS; i++) {
      Ray sunRay = Ray(inScatterPoint, SUN.direction);
      Ray viewRay = Ray(inScatterPoint, -camera.direction);
      float sunRayPath = SphereBoundary(sunRay, ATMOSPHERE_RADIUS).y;
      if (sunRayPath == INFINITY) continue;
      float sunRayOpticalDepth = AtmosphereOpticalDepth(sunRay, sunRayPath);
      float viewOpticalDepth = AtmosphereOpticalDepth(viewRay, stepSize * float(i));
      float density = AtmosphereDensity(inScatterPoint);
      vec3 transmittance = exp(-(sunRayOpticalDepth + viewOpticalDepth) * SCATTERING_COEFFICIENTS);
      inScatteredLight += density * transmittance * SCATTERING_COEFFICIENTS * stepSize;
      inScatterPoint += camera.direction * stepSize;
    }
    return ((inScatteredLight));
  }

  vec3 PBR(Ray camera, Geometry geometry, Material material, Light light, float ao, float shadows) {
    vec3 V = - camera.direction;
    vec3 N = geometry.normal;
    //return N;
    vec3 albedo = GammaExpansion(material.albedo);
    float metalness = saturate(material.metallic);
    float roughness = mix(.1, 1., material.roughness);
    float reflectance = clamp(0., .16, material.reflectance);
    float alpha = pow(roughness, 2.);
    float a2 = pow(alpha, 2.);
    float k = saturate(alpha / 2.);
    vec3 Fo = mix(vec3(reflectance), albedo, metalness);  
    vec3 diffuse = (1. - metalness) * albedo / PI; 
    vec3 Lo;
    {// direct
      vec3 L = normalize(light.direction);
      vec3 H = normalize(V + L);
      float D = a2 / (PI * pow(pow(saturate(dot(N, H)), 2.) * (a2 - 1.) + 1., 2.));
      float G = 1. / mix(saturate(dot(N, L)), 1., k) * mix(saturate(dot(N, V)), 1., k);
      vec3 F = mix(vec3(pow(1. - saturate(dot(L, H)), 5.)), vec3(1), Fo);
      vec3 radiance = light.color; 
      //return diffuse * saturate(dot(N, L));
      //return vec3(1) * saturate(dot(N, L));
      //return vec3(D * G / 4.);
      Lo += mix(diffuse, vec3(D * G / 4.), F) * radiance * saturate(dot(N, L));
    }
    {// bouncing
      vec3 L = normalize(-light.direction);
      vec3 H = normalize(V + L);
      float D = a2 / (PI * pow(pow(saturate(dot(N, H)), 2.) * (a2 - 1.) + 1., 2.));
      float G = 1. / mix(saturate(dot(N, L)), 1., k) * mix(saturate(dot(N, V)), 1., k);
      vec3 F = mix(vec3(pow(1. - saturate(dot(L, H)), 5.)), vec3(1), Fo);
      vec3 radiance = .2 * light.color * ao * (1. - ao) * (1. - shadows);
      Lo += mix(diffuse, vec3(D * G / 4.), F) * radiance * saturate(dot(N, L));
    }
    return GammaExpansion(GammaCompression(Lo)) * ao * shadows;
  }

  vec3 JumpFlooding(vec2 uv) {
    float wavesDistance = length(texture(JUMP_FLOODING_BUFFER, uv).xy);
    float costa = 60.;
    if (wavesDistance < costa) return GammaExpansion(vec3(abs(sin(wavesDistance - iTime * 0.001)) * smoothstep(0., 1., (1. - wavesDistance / costa))));
    else return vec3(0.);
  }

  vec3 Render(vec2 uv) {
    Ray camera = Camera(uv);
    Geometry planet = PlanetGeometry(uv, camera);
    Geometry ocean = OceanGeometry(camera);
    Geometry atmosphere = AtmosphereGeometry(camera);

    float shadows = 1.;

    if (planet.distance <= .9 * FAR) shadows = texture(GEOMETRY_BUFFER, uv).a;

    vec3 environment;
    if (atmosphere.distance == FAR) return environment;

    float path = atmosphere.path;

    if (min(planet.distance, ocean.distance) < FAR) path = abs(atmosphere.distance - min(planet.distance, ocean.distance));
    vec3 light =  GammaExpansion(GammaExpansion(saturate(AtmosphereLight(Ray(atmosphere.position, camera.direction), path))));

    //if (min(planet.distance, ocean.distance) > .9 * FAR) return GammaCompression(mix((environment), light, path / (2. * ATMOSPHERE_RADIUS)));
    if (min(planet.distance, ocean.distance) > .9 * FAR) return GammaCompression((1. - light) * environment + light);
    //return GammaCompression((1. - light) * environment + light);
    if (planet.distance < ocean.distance) {
      float ao = SSAO(uv, camera, planet);
    
      vec2 coord = sphereToUv(normalize(planet.position));
   
      vec3 elevation = TurboColorPallete(smoothstep(0., 1., texture(ELEVATION_BUFFER, coord).r));
      vec3 albedo = GammaCompression(texture(BASEMAP_TEXTURE, planet.coord).rgb);
      Material material = Material(albedo, .0, 0., .04);
    
      vec3 indirect = IBL(camera, planet, material, ao);
      vec3 direct = PBR(camera, planet, material, SUN, ao, 1.);
     // vec3 color = direct + indirect * .5;
     vec3 color = GammaExpansion(GammaCompression(mix(indirect, direct, direct)));
    // vec3 color = mix(direct,indirect);
    // return GammaCompression(mix(color, light, path / (atmosphere.path)));
     return GammaCompression((1. - light) * color + light);
   } else {
      float depth = smoothstep(0., 1., smoothstep(0., 1., smoothstep(0., 1., smoothstep(0., 1., clamp(0., 1., abs(planet.distance - ocean.distance) / abs(OCEAN_RADIUS - MARIANAS_RADIUS))))));
      
      float ao = SSAO(uv, camera, planet);
      vec3 planetElevation = GammaCompression(texture(BASEMAP_TEXTURE, planet.coord).rgb);
      Material planetMaterial = Material(planetElevation, .0, 0., .04);
      vec3 planetIndirect = IBL(camera, planet, planetMaterial, ao);
      planetIndirect = GammaExpansion(planetElevation);
      vec3 waterColor = TurboColorPallete(0.);

      if (planet.distance < .9 * FAR) waterColor = waterColor * ao;
      if (planet.distance >= .9 * FAR && ocean.distance < FAR) shadows = saturate(dot(ocean.normal, SUN.direction));

      if (planet.distance >= .9 * FAR) planetIndirect = waterColor;
     
      vec3 waveA = texture(WAVE_B_TEXTURE, ocean.coord * 40. + vec2(iTime * .00005, 0)).rgb;
      vec3 waveB = texture(WAVE_A_TEXTURE, ocean.coord * 40. + vec2(0, iTime * .00005)).rgb;
      vec3 wavesScreenSpace = normalize(mix(waveA, waveB, .5));
      vec3 tangent = normalize(cross(ocean.normal, vec3(0.0, 1.0, 0.0)));
      vec3 bitangent = cross(ocean.normal, tangent);
      mat3 TBN = mat3(tangent, bitangent, ocean.normal);
      ocean.normal = normalize(TBN * wavesScreenSpace);

      float t = abs(planet.distance - ocean.distance);
   
      vec3 waves = JumpFlooding(ocean.coord);
      vec3 albedo = GammaCompression(mix(planetIndirect, waterColor * shadows, depth * (1. - shadows)));
      albedo = mix(albedo, waves, waves * .5);
      Material material = Material(albedo, .0, 0., .16);
      vec3 indirect = IBL(camera, ocean, material, 1.);
      vec3 direct = PBR(camera, ocean, material, SUN, 1., 1.);
      vec3 color = vec3(saturate(dot(SUN.direction, ocean.normal)));
      //color = mix(direct, indirect, indirect);
      color = GammaExpansion(GammaCompression(mix(indirect, direct, direct)) );
      
    // return GammaCompression(mix(color, light, path / (atmosphere.path)));
     return GammaCompression((1. - light) * color + light);
   }
  }

  vec4 Pixel(vec2 uv) { return vec4(Render(uv), 0); }`
)

const image = Pixel(
  `uniform highp sampler2D PATH_TRACED_BUFFER;
  uniform highp sampler2D JUMP_FLOODING_BUFFER;
  uniform float iTime;
 
  #define GammaExpansion(color) pow(vec3(color), vec3(2.2))
  #define GammaCompression(color) pow(vec3(color), vec3(1. / 2.2))
  #define EncodeVec2(xy) uintBitsToFloat(packHalf2x16(xy))
  #define DecodeVec2(packedFloat) unpackHalf2x16(floatBitsToUint(packedFloat))
    
  vec3 uvToSphere(vec2 uv) {
    const float PI = radians(180.);
    float phi = (uv.x * 2.0 * PI) - PI;
    float theta = PI * (1.0 - uv.y);
    float x = sin(theta) * cos(phi);
    float y = cos(theta);
    float z = sin(theta) * sin(phi);
    return vec3(x, y, z);
  }
  vec2 sphereToUv(vec3 direction) {
    const float PI = radians(180.);
    float phi = atan(direction.z, direction.x);
    float theta = acos(direction.y);
    float u = (phi + PI) / (2.0 * PI);
    float v = theta / PI;
    return vec2(u, 1. - v);
  }

  vec2 PincushionDistortion(vec2 uv, float strength) {
    vec2 st = uv - 0.5;
    float uvA = atan(st.x, st.y);
    float uvD = dot(st, st);
    return 0.5 + vec2(sin(uvA), cos(uvA)) * sqrt(uvD) * (1.0 - strength * uvD);
  }
  vec3 ChromaticAbberation(vec2 uv, highp sampler2D sampler) {
    float amount = .5;
    return vec3(
      texture(sampler, PincushionDistortion(uv, 0.3 * amount)).r,
      texture(sampler, PincushionDistortion(uv, 0.15 * amount)).g,
      texture(sampler, PincushionDistortion(uv, 0.075 * amount)).b
    );
  }
  #define ACESFilmic(color) (color * (2.51 * color + .03)) / (color * (2.43 * color + .59) + .14)
  #define Contrast(color) color * color * (3. -2. * color)
  #define HighlightRolloff(color) 1.85 * color / (1. + color)
  vec3 FilmGrain(vec2 uv, vec3 color) {
    float seed = dot(uv, vec2(12.9898, 78.233));
    float noise = .7978845608028654 * exp(-(pow(fract(sin(seed) * 43758.5453), 2.) / .5));
    vec3 grain = vec3(noise) * (1.0 - color);
    return color + noise * .075;
  }
  #define Vignetting(uv, color) color * (.5 + .5 * pow(16. * uv.x * uv.y * (1. - uv.x) * (1. - uv.y), .25))

  float JumpFlooding(vec2 uv) {
    float wavesDistance = length(texture(JUMP_FLOODING_BUFFER, uv).xy);
    float coastDepth = smoothstep(0., 1., smoothstep(0., 1., clamp(wavesDistance, 0., 15.) / 15.));
    if (wavesDistance == 0.) return 0.;
    return abs(sin(wavesDistance - iTime * 2.));
  }
  vec4 Pixel(vec2 uv) {
    vec3 color = ChromaticAbberation(uv, PATH_TRACED_BUFFER);
    color = Vignetting(uv, color);
    color = FilmGrain(uv, color);
    color = GammaCompression(ACESFilmic(GammaExpansion(color)));    
    color = Contrast(color);
    color = HighlightRolloff(color);
    return vec4(color, 1.);
  }`
)

elevation()
normals()
brdf()
irradiance()
radiance()

const byFrame = timestamp => {
  UpdateCameraSystem()
  view()
  geometry()
  light()
  if (GlobalUniformComponents.get('iFrame')[1] < 600) jumpFlooding()
  image()
  GlobalUniformComponents.get('iTime')[1] = timestamp
  GlobalUniformComponents.get('iFrame')[1]++
  requestAnimationFrame(byFrame)
}
requestAnimationFrame(byFrame)