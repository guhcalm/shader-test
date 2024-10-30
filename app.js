const DOMComponents = new Map()
const ContextComponents = new Map()
const TextureComponents = new Map()
const GlobalUniformComponents = new Map([
  ['iTime', ['uniform1f', 0]],
  ['iResolution', ['uniform2fv', new Float32Array([0, 0])]],
  ['iMouse', ['uniform2fv', new Float32Array([500, 500])]],
  ['iCamera', ['uniform3fv', new Float32Array([0, 0, 0])]],
  ['iFrame', ['uniform1i', 0]],
  ['TILE_LONGITUDE_START', ['uniform1f', -Math.PI]],
  ['TILE_LONGITUDE_END', ['uniform1f', Math.PI]],
  ['TILE_LATITUDE_START', ['uniform1f', -85.05112878 * (Math.PI / 180)]],
  ['TILE_LATITUDE_END', ['uniform1f', 85.05112878 * (Math.PI / 180)]],
  ['iZoom', ['uniform1f', 0]]
])

const CartesianBySpherical = ({ longitude, latitude }) => {
  const { cos, sin } = Math
  const x = cos(latitude) * sin(longitude) // x = 0 quando longitude é 0 ou ±180°, e ±1 em ±90°
  const y = sin(latitude) // y = -1 em -90°, 0 em 0°, e 1 em 90°
  const z = cos(latitude) * cos(longitude) // z = 1 em 0°, -1 em ±180°, e 0 em ±90°
  return { x, y, z }
}
const SphericalByEquirectangular = ({ u, v }) => {
  const { PI } = Math
  const radians = deg => (deg * PI) / 180
  const longitude = (u * 2 - 1) * radians(180)
  const latitude = (v * 2 - 1) * radians(90)
  return { longitude, latitude }
}
const UpdateCameraSystem = () => {
  const iMouse = GlobalUniformComponents.get('iMouse')[1]
  const iResolution = GlobalUniformComponents.get('iResolution')[1]
  const iTime = GlobalUniformComponents.get('iTime')[1]
  const { PI, sin, cos } = Math
  const mix = (a, b, t) => (t < 0 ? a : t > 1 ? b : (1 - t) * a + t * b)
  const m = { u: iMouse[0] / iResolution[0], v: iMouse[1] / iResolution[1] }

  const theta = -m.x * PI * 2 - 2.3

  const lerp = (a, b, t) => (t < 0 ? a : t > 1 ? b : (1 - t) * a + t * b)
  const zoom = Math.floor(lerp(0, 19, GlobalUniformComponents.get('iZoom')[1]))
  const radius = lerp(55, 20, zoom)
  const { longitude, latitude } = SphericalByEquirectangular(m)
  const { x, y, z } = CartesianBySpherical({ longitude: longitude, latitude })
  const current = GlobalUniformComponents.get('iCamera')[1]
  const iCamera = new Float32Array([lerp(current[0], radius * x, 0.5 / 2 ** (zoom + 2)), lerp(current[1], radius * y, 0.5 / 2 ** (zoom + 2)), lerp(current[2], radius * z, 0.5 / 2 ** (zoom + 2))])
  GlobalUniformComponents.get('iCamera')[1] = iCamera
}

let sinal = 1
document.body.onclick = () => {
  if (GlobalUniformComponents.get('iZoom')[1] > 1 || GlobalUniformComponents.get('iZoom')[1] < 0) sinal *= -1
  GlobalUniformComponents.get('iZoom')[1] += sinal * (1 / 19)
}

// FRONT BUFFER
{
  const canvas = document.querySelector('canvas')
  const { width, height } = document.documentElement.getBoundingClientRect()
  canvas.width = width
  canvas.height = height
  GlobalUniformComponents.get('iResolution')[1] = new Float32Array([canvas.width, canvas.height])
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
const Shader = (name, fragmentCode, { width, height } = {}) => {
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
await ClampedTexture('OSM_TEXTURE', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0')
await ClampedTexture('PATH_TRACER_BUFFER', './PATH_TRACER_BUFFER_16.png')
await ClampedTexture('NORMAL_BUFFER', './NORMAL_BUFFER.png')
await ClampedTexture('PATH_TRACER_OCCLUSION_BUFFER', './PATH_TRACER_OCCLUSION_BUFFER.png')
await ClampedTexture('BRDF_BUFFER', './BRDF_BUFFER.png')
await ClampedTexture('IRRADIANCE_BUFFER', './IRRADIANCE_BUFFER.png')
await ClampedTexture('RADIANCE_BUFFER', './RADIANCE_BUFFER.png')
await ClampedTexture('JUMP_FLOODING_BUFFER', './JUMP_FLOODING_BUFFER.png')

const BasemapTilesComponents = {}

const BasemapSystem = () => {
  /*
  const SphereByWgs84 = wgs => {
    const { PI } = Math
    const longitude = PI * (2 * wgs.u - 1)
    const latitude = (PI / 2) * (2 * wgs.v - 1)
    return { longitude, latitude }
  }
  const iMouse = GlobalUniformComponents.get('iMouse')[1]
  const iResolution = GlobalUniformComponents.get('iResolution')[1]
  const { latitude, longitude } = SphereByWgs84({ u: iMouse[0] / iResolution[0], v: iMouse[1] / iResolution[1] })


  vec3 CartesianBySpherical(vec2 spherical) {
    float x = cos(spherical.y) * sin(spherical.x); // x = 0 quando longitude é 0 ou ±180°, e ±1 em ±90°
    float y = sin(spherical.y);                    // y = -1 em -90°, 0 em 0°, e 1 em 90°
    float z = cos(spherical.y) * cos(spherical.x); // z = 1 em 0°, -1 em ±180°, e 0 em ±90°
    return normalize(vec3(x, y, z));
  }
  vec2 SphericalByCartesian(vec3 cartesian) {
    float longitude = atan(cartesian.x, cartesian.z);
    float latitude = asin(cartesian.y);
    return vec2(longitude, latitude);
  } 
   */

  const lerp = (a, b, t) => (t < 0 ? a : t > 1 ? b : (1 - t) * a + t * b)
  const z = Math.floor(lerp(0, 19, GlobalUniformComponents.get('iZoom')[1]))
  const iCamera = GlobalUniformComponents.get('iCamera')[1]
  const SphereByDirection = direction => {
    const length = Math.hypot(direction[0], direction[1], direction[2])
    const normalized = { x: direction[0] / length, y: direction[1] / length, z: direction[2] / length }
    const { atan2, asin } = Math
    const longitude = atan2(normalized.x, normalized.z)
    const latitude = asin(normalized.y)
    return { longitude, latitude }
  }
  const { longitude, latitude } = SphereByDirection(iCamera)
  const { width, height } = document.documentElement.getBoundingClientRect()

  /*
  
  vec2 MercatorBySpherical(vec2 spherical) {
    #define ln(value) log(value)
    const float PI = radians(180.);
    const float MAX_LATITUDE = atan(sinh(PI)); // 85.05112878°
    spherical.y = min(max(-MAX_LATITUDE, spherical.y), MAX_LATITUDE);
    float u = (spherical.x / PI) * .5 + .5;
    float v = (PI - ln(tan(PI / 4. + spherical.y / 2.))) / (2. * PI);
    return vec2(u, v);
  }
  vec2 SphericalByMercator(vec2 mercator) {
    const float PI = radians(180.);
    float longitude = (mercator.x * 2. - 1.) * PI;
    float latitude = 2. * atan(exp(((1. - mercator.y) - 0.5) * 2. * PI)) - PI / 2.;
    return vec2(longitude, latitude);
  }

  */

  const SphereToPseudoMercator = ({ latitude, longitude }) => {
    const { log: ln, tan, PI: π } = Math
    const radians = deg => (deg * π) / 180
    const clamp = (min, max, value) => Math.max(Math.min(value, max), min)
    const saturate = value => clamp(0, 1, value)
    const U = λ => (λ / π) * 0.5 + 0.5
    const V = ϕ => (π - ln(tan(π / 4 + ϕ / 2))) / (2 * π)
    const λ = longitude
    const ϕ = clamp(radians(-85.05112878), radians(85.05112878), latitude)
    return { u: U(λ), v: saturate(V(ϕ)) }
  }

  function WebMercatorTile({ zoom: z, latitude, longitude }) {
    const { u, v } = SphereToPseudoMercator({ latitude, longitude })
    const i = Math.floor(u * 2 ** z)
    const j = Math.floor(v * 2 ** z)
    return { z, u, v, i, j }
  }

  const OSM = ({ s = 'a', z, x, y }) => `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`
  const Esri = ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`

  const target = WebMercatorTile({ zoom: z, latitude, longitude })
  const neighboors = Math.ceil(Math.ceil(Math.max(width, height) / 256) / 2)
  const tile = 256
  const gridSize = (2 * neighboors + 1) * tile

  const tiles = document.createElement('canvas')
  tiles.style = 'display: none'
  tiles.width = 256
  tiles.height = 256
  const context = tiles.getContext('2d')

  if (gridSize >= 2 ** z * 256) {
    tiles.width = 2 ** z * 256
    tiles.height = 2 ** z * 256
    GlobalUniformComponents.get('TILE_LONGITUDE_START')[1] = -Math.PI
    GlobalUniformComponents.get('TILE_LONGITUDE_END')[1] = Math.PI
    GlobalUniformComponents.get('TILE_LATITUDE_START')[1] = -85.05112878 * (Math.PI / 180)
    GlobalUniformComponents.get('TILE_LATITUDE_END')[1] = 85.05112878 * (Math.PI / 180)

    let row = 0
    for (let j = 0; j < 2 ** z; j++) {
      let column = 0
      for (let i = 0; i < 2 ** z; i++) {
        let x = i
        let y = j

        const left = column * tile
        const top = row * tile

        column++

        if (y < 0 || y >= 2 ** z) continue
        if (x < 0) x = z === 0 ? 0 : 2 ** z + x
        if (x >= 2 ** z) x = z === 0 ? 0 : x - 2 ** z

        const id = [z, x, y].join('-')
        if (!(id in BasemapTilesComponents)) {
          const img = new Image(256, 256)
          img.crossOrigin = 'anonymous'
          img.src = OSM({ z, x, y })
          BasemapTilesComponents[id] = img
        }

        context.drawImage(BasemapTilesComponents[id], left, top, tile, tile)
      }
      row++
    }
  } else {
    tiles.width = gridSize
    tiles.height = gridSize

    const COLUMN_START = (target.i - neighboors) / 2 ** z
    const COLUMN_END = (target.i + neighboors + 1) / 2 ** z
    const ROW_START = (target.j + neighboors + 1) / 2 ** z
    const ROW_END = (target.j - neighboors) / 2 ** z

    const SphereByMercator = (u, v) => {
      const { PI, exp, atan } = Math
      const radians = deg => (deg * PI) / 180
      const clamp = angle => Math.min(Math.max(radians(-85.05112878), angle), radians(85.05112878))
      const longitude = PI * (2 * u - 1)
      const latitude = 2 * atan(exp((1 - v - 0.5) * 2 * PI)) - PI / 2
      return [longitude, clamp(latitude)]
    }

    const [TILE_LONGITUDE_START, TILE_LATITUDE_START] = SphereByMercator(COLUMN_START, ROW_START)
    const [TILE_LONGITUDE_END, TILE_LATITUDE_END] = SphereByMercator(COLUMN_END, ROW_END)

    GlobalUniformComponents.get('TILE_LONGITUDE_START')[1] = TILE_LONGITUDE_START
    GlobalUniformComponents.get('TILE_LONGITUDE_END')[1] = TILE_LONGITUDE_END
    GlobalUniformComponents.get('TILE_LATITUDE_START')[1] = TILE_LATITUDE_START
    GlobalUniformComponents.get('TILE_LATITUDE_END')[1] = TILE_LATITUDE_END

    const topN = target.i - neighboors < 0 ? Math.abs(target.i - neighboors) : neighboors
    const bottomN = target.i - neighboors < 0 ? Math.abs(target.i - neighboors) : neighboors
    tiles.height = (topN + bottomN + 1) * tile

    let row = 0
    for (let j = -neighboors; j <= neighboors; j++) {
      let column = 0
      for (let i = -neighboors; i <= neighboors; i++) {
        let x = target.i + i
        let y = target.j + j

        const left = column * tile
        const top = row * tile

        column++

        if (y < 0 || y >= 2 ** z) continue
        if (x < 0 || x >= 2 ** z) continue
        // if (x < 0) x = z === 0 ? 0 : 2 ** z + x
        //if (x >= 2 ** z) x = z === 0 ? 0 : x - 2 ** z

        const id = [z, x, y].join('-')
        if (!(id in BasemapTilesComponents)) {
          const img = new Image(256, 256)
          img.src = OSM({ z, x, y })
          img.crossOrigin = 'anonymous'
          BasemapTilesComponents[id] = img
        }

        context.drawImage(BasemapTilesComponents[id], left, top, tile, tile)
      }
      row++
    }
  }

  const gl = ContextComponents.get('Front-Buffer')
  const id = TextureComponents.get('OSM_TEXTURE')?.id || TextureComponents.size
  const texture = gl.createTexture()

  gl.activeTexture(gl.TEXTURE0 + id)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tiles)
  TextureComponents.set('OSM_TEXTURE', { id, texture })
}

const COMMON = `
  struct Ray { vec3 origin; vec3 direction; };
  struct Geometry { vec3 position; vec3 normal; float distance; vec2 coord; float path; };
  struct Uv { float u; float v; };
  struct Sphere { float longitude; float latitude; };
  struct Light { vec3 direction; vec3 color; };
  struct Material { vec3 albedo; float roughness; float metallic; float reflectance; };

  
  const float PI = radians(180.);
  const vec3 PLANET_POSITION = vec3(0);
  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;
  const float OCEAN_RADIUS = mix(MARIANAS_RADIUS, EVEREST_RADIUS, .8);
  const float ATMOSPHERE_RADIUS = EVEREST_RADIUS + .1;

  const float NEAR = .001;
  const float FAR = 100.;
  const Geometry DEFAULT_GEOMETRY = Geometry(vec3(0), vec3(0), FAR, vec2(0), 0.);
  const Light SUN = Light(normalize(vec3(1, 1, 1)), vec3(1));

  #define GammaExpansion(color) pow(vec3(color), vec3(2.2))
  #define GammaCompression(color) pow(vec3(color), vec3(1. / 2.2))
  #define saturate(value) clamp(value, 0., 1.)

  vec2 EquirectangularBySpherical(vec2 spherical) {
    float u = (spherical.x / radians(180.)) * .5 + .5;
    float v = (spherical.y / radians(90.)) * .5 + .5;
    return vec2(u, v);
  }
  vec2 SphericalByEquirectangular(vec2 Equirectangular) {
    float longitude = (Equirectangular.x * 2. - 1.) * radians(180.);
    float latitude =  (Equirectangular.y * 2. - 1.) * radians(90.);
    return vec2(longitude, latitude);
  }
  vec3 CartesianBySpherical(vec2 spherical) {
    float x = cos(spherical.y) * sin(spherical.x); // x = 0 quando longitude é 0 ou ±180°, e ±1 em ±90°
    float y = sin(spherical.y);                    // y = -1 em -90°, 0 em 0°, e 1 em 90°
    float z = cos(spherical.y) * cos(spherical.x); // z = 1 em 0°, -1 em ±180°, e 0 em ±90°
    return normalize(vec3(x, y, z));
  }
  vec2 SphericalByCartesian(vec3 cartesian) {
    float longitude = atan(cartesian.x, cartesian.z);
    float latitude = asin(cartesian.y);
    return vec2(longitude, latitude);
  } 
  vec2 MercatorBySpherical(vec2 spherical) {
    #define ln(value) log(value)
    const float PI = radians(180.);
    const float MAX_LATITUDE = atan(sinh(PI)); // 85.05112878°
    spherical.y = min(max(-MAX_LATITUDE, spherical.y), MAX_LATITUDE);
    float u = (spherical.x / PI) * .5 + .5;
    float v = (PI - ln(tan(PI / 4. + spherical.y / 2.))) / (2. * PI);
    return vec2(u, v);
  }
  vec2 SphericalByMercator(vec2 mercator) {
    const float PI = radians(180.);
    float longitude = (mercator.x * 2. - 1.) * PI;
    float latitude = 2. * atan(exp(((1. - mercator.y) - 0.5) * 2. * PI)) - PI / 2.;
    return vec2(longitude, latitude);
  }

  #define EquirectangularByCartesian(cartesian) EquirectangularBySpherical(SphericalByCartesian(cartesian))
  #define CartesianByEquirectangular(equirectangular) CartesianBySpherical(SphericalByEquirectangular(equirectangular))
`

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

    float spacing = 1./30.;
    float lines = mod(elevation, spacing) / spacing;
    lines = min(lines * 2., 1.) - max(lines * 2. - 1., 0.);
    lines /= fwidth(elevation / spacing);
    lines /= 2.;
     float t = (abs(fract(30. * elevation)-.5)/fwidth(30. * elevation));
   

    return vec4(vec3(elevation), 1);
  }`
)

const view = Shader(
  'VIEW_BUFFER',
  `uniform vec2 iResolution;
  uniform vec2 iMouse;
  uniform vec3 iCamera;
  uniform float iTime;
  uniform float iZoom;

  
  vec3 Up(vec3 w) {
    const vec3 up = vec3(0, 1, 0);
    vec3 u = normalize(cross(w, up));
    return normalize(cross(u, w));
  }

  /* Panini Camera */
  vec3 CameraDirection(vec2 uv) {
    vec3 origin = iCamera;
    float z = mix(0., 19., iZoom);
    float focalLength = pow(2., z) - 1.;
    vec3 target;
    float aspect = iResolution.x / iResolution.y;
    vec3 ndc = vec3(uv * 2.0 - 1.0, 1.0);
    const float fov = radians(20.);
    float f = tan(fov / 2.0);
    vec3 screen = vec3(ndc.x * aspect * f, ndc.y * f, ndc.z / f);
    float d = sqrt(1.0 + screen.x * screen.x + screen.y * screen.y);
    float u = screen.x / (screen.z + d * focalLength);
    float v = screen.y / (screen.z + d * focalLength);
    vec3 paniniScreen = normalize(vec3(u, v, 1.0));  
    vec3 w = normalize(target - origin);
    vec3 uAxis = normalize(cross(w, Up(w)));
    vec3 vAxis = normalize(cross(uAxis, w));
    return normalize(mat3(uAxis, vAxis, w) * paniniScreen);
  }

  vec2 DirectionToUV(vec3 direction) {
    // Parâmetros da câmera e projeção
    float focalLength = mix(0., 120., sin(iTime * .001) * .5 + .5);
    float aspect = iResolution.x / iResolution.y;
    const float fov = radians(20.);
    
    // Cálculos auxiliares de projeção
    float f = tan(fov / 2.0);
    
    // Obtemos a projeção Panini invertida
    float u = direction.x / direction.z;
    float v = direction.y / direction.z;
    float d = sqrt(1.0 + u * u + v * v);

    // Aplicando a distância focal para obter o efeito Panini invertido
    float screenX = u * (d * focalLength);
    float screenY = v * (d * focalLength);

    // Converte as coordenadas da tela para UV normalizado (0 a 1)
    vec2 ndc = vec2(screenX / (aspect * f), screenY / f);
    return (ndc + 1.0) * 0.5; // Ajuste para UV na faixa 0-1
  }

  vec2 WorldPositionToUV(vec3 worldPosition) {
    // Parâmetros da câmera e projeção
    vec3 origin = iCamera;  // Posição da câmera
    float focalLength = mix(0., 120., sin(iTime * .001) * .5 + .5); // Distância focal variável
    const float fov = radians(20.);  // Campo de visão
    float aspect = iResolution.x / iResolution.y;  // Relação de aspecto
    
    // Vetores da base da câmera
    vec3 target = vec3(0.0);  // Direção para onde a câmera está apontando (pode ser ajustado)
    vec3 w = normalize(target - origin); // Vetor de direção da câmera
    vec3 uAxis = normalize(cross(vec3(0, 1, 0), w)); // Eixo horizontal da câmera
    vec3 vAxis = normalize(cross(w, uAxis)); // Eixo vertical da câmera

    // Calcula a direção da posição do mundo para a câmera
    vec3 viewDir = worldPosition - origin;
    vec3 localPos = vec3(dot(viewDir, uAxis), dot(viewDir, vAxis), dot(viewDir, w));

    // Conversão da direção para o espaço da tela com efeito Panini
    float f = tan(fov / 2.0);
    float d = sqrt(1.0 + localPos.x * localPos.x / (aspect * f) + localPos.y * localPos.y / f);
    float screenX = localPos.x / (localPos.z + d * focalLength);
    float screenY = localPos.y / (localPos.z + d * focalLength);

    // Converte para NDC e depois para UV
    vec2 ndc = vec2(screenX * aspect * f, screenY * f);
    return (ndc + 1.0) * 0.5; // Ajusta para a faixa UV [0, 1]
  }

  struct Ray { vec3 origin; vec3 direction; };

  Ray DirectionByUv(in vec2 uv, vec3 origin, vec3 target, float aspect) {
    vec3 ndc = vec3(uv * 2. - 1., 1.);
    const float fov = radians(60.);
    const vec3 up = vec3(0, 1, 0);
    float f = tan(fov / 2.);
    vec3 screen = normalize(vec3(ndc.x * aspect * f, ndc.y * f, ndc.z / f));
    vec3 w = normalize(target - origin);
    vec3 u = normalize(cross(w, Up(w)));
    vec3 v = normalize(cross(u, w));
    return Ray(origin, normalize(mat3(u, v, w) * screen));
  }

  vec2 UvByDirection(vec3 direction, vec3 origin, vec3 target, float aspect) {
    const float fov = radians(60.0); // Campo de visão em radianos

    // Calcula a base da câmera
    vec3 w = normalize(target - origin);      // Vetor de direção da câmera
    vec3 u = normalize(cross(w, Up(w)));         // Eixo horizontal da câmera
    vec3 v = normalize(cross(u, w));          // Eixo vertical da câmera

    // Transforma a direção fornecida para o espaço da câmera
    vec3 screenDir = transpose(mat3(u, v, w)) * direction;

    // Projeção inversa para coordenadas normalizadas da tela (NDC)
    float f = tan(fov / 2.0);
    vec2 ndc = vec2(screenDir.x / (aspect * f), screenDir.y / f);

    // Converte NDC para UV na faixa [0, 1]
    return (ndc + 1.0) * 0.5;
  }


  vec2 UvByWorldPosition(vec3 worldPosition, vec3 origin, vec3 target, float aspect) {
    const float fov = radians(60.0); // Campo de visão em radianos
    

    // Calcula a base da câmera
    vec3 w = normalize(target - origin);      // Vetor de direção da câmera
    vec3 u = normalize(cross(w, Up(w)));         // Eixo horizontal da câmera
    vec3 v = normalize(cross(u, w));          // Eixo vertical da câmera

    // Converte a posição no mundo para o espaço da câmera
    vec3 viewDir = worldPosition - origin;
    vec3 localPos = vec3(dot(viewDir, u), dot(viewDir, v), dot(viewDir, w));

    // Projeção perspectiva para o plano da tela
    float f = tan(fov / 2.0);
    vec2 ndc = vec2(localPos.x / (localPos.z * aspect * f), localPos.y / (localPos.z * f));

    // Converte NDC para UV na faixa [0, 1]
    return (ndc + 1.0) * 0.5;
  }


  vec4 Pixel(vec2 uv) { return vec4(CameraDirection(uv), 0); }`
)

const geometry = Shader(
  'GEOMETRY_BUFFER',
  `uniform vec3 iCamera;
  uniform float iTime;
  uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D VIEW_BUFFER;


  ${COMMON}

  #define Camera(uv) Ray(iCamera, texture(VIEW_BUFFER, uv).xyz)


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
    vec2 uv = EquirectangularByCartesian(normalize(position));
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
    //return vec4(vec3(boundary.x / FAR), 1.);
    float distance = RayMarcher(camera, boundary.x);
    float depth = distance / FAR;
    vec3 position = camera.origin + camera.direction * distance;
    float shadows = SoftShadows(position, SUN);
    return vec4(vec3(depth), shadows);
  }`
)

/*

const jumpFlooding = PingPongShader(
  'JUMP_FLOODING_BUFFER',
  `uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D JUMP_FLOODING_BUFFER;
  uniform int iFrame;
  uniform vec2 iResolution;

  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;
  const float OCEAN_RADIUS = mix(MARIANAS_RADIUS, EVEREST_RADIUS, .8);

  // Jump Flooding on Heightmap 

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
  vec2 EquirectangularByCartesian(vec3 direction) {
    const float PI = radians(180.);
    float phi = atan(direction.z, direction.x);
    float theta = acos(direction.y);
    float u = (phi + PI) / (2.0 * PI);
    float v = theta / PI;
    return vec2(u, 1. - v);
  }
    
  // Irradiance Map 
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

  #define Environmentmap(direction) texture(ENVIRONMENT_TEXTURE, EquirectangularByCartesian(RandomVectorOnHemisphere(direction))).rgb
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
*/
/*
const normals = PingPongShader(
  'NORMAL_BUFFER',
  `uniform vec3 iCamera;
  uniform float iTime;
  uniform int iFrame;
  uniform vec2 iResolution;
  uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D NORMAL_BUFFER;

  ${COMMON}

  const int PATH_TRACE_STEPS = 100;  
  const float EPSILON = .001;
  const vec3 PLANET_POSITION = vec3(0);
  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;
  const float INFINITY = 000.;

  #define Camera(uv) Ray(iCamera, texture(VIEW_BUFFER, uv).xyz)

  #define Elevationmap(uv) texture(ELEVATION_BUFFER, uv).r
  float PlanetSDF(in vec3 position) {
    vec2 coord = EquirectangularByCartesian(normalize(position));
    float bump = Elevationmap(coord);
    float radius = mix(MARIANAS_RADIUS, EVEREST_RADIUS, bump);
    float d = length(position) - radius;
    return d * .1;
  }
  float SDF(in vec3 p) { return PlanetSDF(p); }

 
  float seed;
  float random() { return fract(sin(seed += .1) * 4568.7564); }
  float random(vec2 uv) { return fract(sin(dot(uv, vec2(127.1, 311.7))) * 4568.7564); }

  float SphereTracer(Ray ray) {
    float distance;
    const float NEAR = EPSILON;
    const float FAR = 18.;
    const float RELAXATION = .35;
    for(int step; step < 800; step++) {
      float march = SDF(ray.origin + ray.direction * distance);
      if (abs(march) <= NEAR) return distance;
      distance += march * RELAXATION;
      if (distance >= FAR) break;
    }
    return INFINITY;
  }
  #define RayMarcher(camera) SphereTracer(camera)

  Geometry GeometryBuffer(Ray camera) {
    float distance = RayMarcher(camera);
    vec3 position = camera.origin + camera.direction * distance;
    vec2 e = vec2(EPSILON, 0);
    vec3 normal = normalize(vec3(
      SDF(position + e.xyy) - SDF(position - e.xyy),
      SDF(position + e.yxy) - SDF(position - e.yxy),
      SDF(position + e.yyx) - SDF(position - e.yyx)
    ));
    return Geometry(distance, position, normal);
  }

  vec4 Pixel(vec2 uv) {
    seed = iTime + random(gl_FragCoord.xy / iResolution.xy); 
    vec2 off = vec2(random(), random());
    uv = saturate((off + gl_FragCoord.xy) / iResolution.xy);
    vec3 direction = CartesianByEquirectangular(uv);
    
    Ray camera = Ray(direction * 4.5, -direction);
    
    Geometry geometry = GeometryBuffer(camera);
    
    vec4 currentFrame = vec4((geometry.normal), 1.);
    vec4 lastFrame = texture(NORMAL_BUFFER, vec2(gl_FragCoord.xy / iResolution.xy));
    return vec4((currentFrame + lastFrame).rgb, 1.);
  }`
)
 
const pathTracer = PingPongShader(
  'PATH_TRACER_BUFFER',
  `uniform vec3 iCamera;
  uniform float iTime;
  uniform int iFrame;
  uniform vec2 iResolution;
  uniform highp sampler2D ENVMAP_TEXTURE;
  uniform highp sampler2D ELEVATION_BUFFER;
  uniform highp sampler2D PATH_TRACER_BUFFER;

  ${COMMON}

  const int PATH_TRACE_STEPS = 200;
    
  const float EPSILON = .001;
  const vec3 PLANET_POSITION = vec3(0);
  const float EVEREST_RADIUS = 1.5;
  const float MARIANAS_RADIUS = (EVEREST_RADIUS - .1) * .8;
  const float INFINITY = 9999.;

  #define Camera(uv) Ray(iCamera, texture(VIEW_BUFFER, uv).xyz)


  // SDF's
  #define Elevationmap(uv) texture(ELEVATION_BUFFER, uv).r
  float PlanetSDF(in vec3 position) {
    vec2 uv = EquirectangularByCartesian(normalize(position));
    float bump = Elevationmap(uv);
    float radius = mix(MARIANAS_RADIUS, EVEREST_RADIUS, bump);
    float d = length(position) - radius;
    return d * .1;
  }
  float SDF(in vec3 p) { return PlanetSDF(p); }

  //
  float seed;
  float random() { return fract(sin(seed += .1) * 4568.7564); }
  float random(vec2 uv) { return fract(sin(dot(uv, vec2(127.1, 311.7))) * 4568.7564); }
  vec3 RandomVectorOnHemisphere(vec3 normal) {
    float u = random();
    float v = random();
    float a = 6.283185 * v;
    float b = u * 2. - 1.;
    vec3 random = vec3(sqrt(1. - b * b) * vec2(cos(a), sin(a)), b);
    return normalize(random * sign(dot(normal, random)));
  }
  float SphereTracer(Ray ray) {
    float distance;
    const float NEAR = EPSILON;
    const float FAR = 18.;
    const float RELAXATION = .35;
    for(int step; step < 800; step++) {
      float march = SDF(ray.origin + ray.direction * distance);
      if (abs(march) <= NEAR) return distance;
      distance += march * RELAXATION;
      if (distance >= FAR) break;
    }
    return INFINITY;
  }
  #define RayMarcher(camera) SphereTracer(camera)

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

  Geometry GeometryBuffer(Ray camera) {
    float distance = RayMarcher(camera);
    vec3 position = camera.origin + camera.direction * distance;
    vec2 e = vec2(EPSILON, 0);
    vec3 normal = normalize(vec3(
      SDF(position + e.xyy) - SDF(position - e.xyy),
      SDF(position + e.yxy) - SDF(position - e.yxy),
      SDF(position + e.yyx) - SDF(position - e.yyx)
    ));
    return Geometry(distance, position, normal);
  }

  vec3 DiffuseRadiance(in Ray camera) {
    #define Environment(direction) GammaExpansion(texture(ENVMAP_TEXTURE, EquirectangularByCartesian(direction)).rgb)
    for (int i; i < 16; i++) {
      Geometry geometry = GeometryBuffer(camera);
      if (geometry.distance == INFINITY) return Environment(camera.direction);
      camera.origin = geometry.position + geometry.normal * .0001;
      camera.direction = RandomVectorOnHemisphere(geometry.normal);
    }          
    return vec3(0);
  }

  vec4 Pixel(vec2 uv) {
   // if (iFrame > PATH_TRACE_STEPS) discard;

    seed = iTime + random(gl_FragCoord.xy / iResolution.xy); 
    vec2 off = vec2(random(), random());
    uv = saturate((off + gl_FragCoord.xy) / iResolution.xy);
    vec3 direction = CartesianByEquirectangular(uv);
    
    Ray camera = Ray(direction * 4.5, -direction);
    
    vec3 radiance = GammaCompression(DiffuseRadiance(camera));
    
    Geometry geometry = GeometryBuffer(camera);
    
    vec4 currentFrame = vec4(radiance, 1.);
    vec4 lastFrame = texture(PATH_TRACER_BUFFER, vec2(gl_FragCoord.xy / iResolution.xy));
    
    return vec4((currentFrame + lastFrame).rgb, 1.);
  }`
)
/**/
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
  uniform highp sampler2D PATH_TRACER_BUFFER;
  uniform highp sampler2D OSM_TEXTURE;
  uniform highp sampler2D PATH_TRACER_OCCLUSION_BUFFER;
  uniform float TILE_LONGITUDE_START;
  uniform float TILE_LONGITUDE_END;
  uniform float TILE_LATITUDE_START;
  uniform float TILE_LATITUDE_END;
  uniform float iResolution;
  uniform float iMouse;
  uniform int iFrame;

  ${COMMON}

  #define Camera(uv) Ray(iCamera, texture(VIEW_BUFFER, uv).xyz)

  vec2 MercatorTileBySpherical(vec2 spherical) {
    const float PI = radians(180.);
    const float MERCATOR_LATITUDE_BOUNDARY = atan(sinh(PI)); // 85.05112878°
    float u = (spherical.x - TILE_LONGITUDE_START) / (TILE_LONGITUDE_END - TILE_LONGITUDE_START);
    float latStartMercator = log(tan(PI / 4.0 + (TILE_LATITUDE_START) / 2.0));
    float latEndMercator = log(tan(PI / 4.0 + (TILE_LATITUDE_END) / 2.0));
    float latitudeMercator = log(tan(PI / 4.0 + clamp((-MERCATOR_LATITUDE_BOUNDARY), (MERCATOR_LATITUDE_BOUNDARY), spherical.y) / 2.0));
    float v = (latitudeMercator - latStartMercator) / (latEndMercator - latStartMercator);
    return vec2(u, v);
  }
  vec3 Basemap(vec2 spherical) {
    if (
     spherical.x >= TILE_LONGITUDE_START && 
     spherical.x <= TILE_LONGITUDE_END &&
     spherical.y >= TILE_LATITUDE_START && 
     spherical.y <= TILE_LATITUDE_END
    ) {
      vec2 mercator = MercatorTileBySpherical(spherical);
      return GammaExpansion(GammaExpansion(texture(OSM_TEXTURE, mercator).rgb));
    }
    vec2 wgs = EquirectangularBySpherical(spherical);
    return (texture(BASEMAP_TEXTURE, wgs).rgb);
  }

  Geometry PlanetGeometry(vec2 uv, Ray camera) {
    float depth = texture(GEOMETRY_BUFFER, uv).r;
    float distance = depth * FAR;
    if (depth >= .9) return DEFAULT_GEOMETRY;
    vec3 position = camera.origin + camera.direction * distance;
    vec2 coord = EquirectangularByCartesian(normalize(position));
    vec3 normal = normalize(texture(NORMAL_BUFFER, coord).rgb * 2. - 1.) /* / float(min(iFrame, 100))*/;
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
    vec2 coord = EquirectangularByCartesian(normalize(position));
    vec3 normal = normalize(position);
    float path = abs(boundary.y - boundary.x);
    return Geometry(position, normal, distance, coord, path);
  }
  Geometry AtmosphereGeometry(Ray camera) {
    vec2 boundary = SphereBoundary(camera, ATMOSPHERE_RADIUS);
    float distance = boundary.x;
    if (distance >= FAR) return DEFAULT_GEOMETRY;
    vec3 position = camera.origin + camera.direction * distance;
    vec2 coord = EquirectangularByCartesian(normalize(position));
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
  
  vec3 IBLBaked(in Ray camera, in Geometry geometry, in Material material, in vec3 irradiance, in float ao) {
    #define Irradiance(normal) texture(IRRADIANCE_BUFFER, EquirectangularByCartesian(normal)).rgb
    #define BluryRadiance(direction) texture(RADIANCE_BUFFER, EquirectangularByCartesian(direction)).rgb
    #define OriginalRadiance(direction) texture(ENVIRONMENT_TEXTURE, EquirectangularByCartesian(direction)).rgb
    #define Brdf(NdotV, roughness) texture(BRDF_BUFFER, vec2(NdotV, roughness)).rg

    vec3 V = -camera.direction;
    vec3 N = geometry.normal;
    vec3 R = reflect(-V, N);

    vec3 albedo = GammaExpansion(material.albedo);
    float metallic = clamp(material.metallic, 0., 1.);
    float roughness = clamp(material.roughness, .1, 1.);
    float reflectance = material.reflectance;
    vec3 F0 = mix(vec3(reflectance), albedo, metallic);
    irradiance = GammaCompression(irradiance);
    float NdotV = clamp(dot(N, V), 0., 1.);
    vec2 brdf = Brdf(NdotV, roughness);
    vec3 fresnel = saturate(F0 * brdf.r + brdf.g);
    vec3 radiance = GammaExpansion(mix(OriginalRadiance(R), BluryRadiance(R), pow(fresnel, vec3(15.))));
    vec3 diffuse = albedo * (irradiance * irradiance + irradiance);
    vec3 specular = (radiance * radiance + radiance) * ao;

    return mix(diffuse, specular, fresnel);
  }
  vec3 IBL(in Ray camera, in Geometry geometry, in Material material) {
    #define Irradiance(normal) texture(IRRADIANCE_BUFFER, EquirectangularByCartesian(normal)).rgb
    #define BluryRadiance(direction) texture(RADIANCE_BUFFER, EquirectangularByCartesian(direction)).rgb
    #define OriginalRadiance(direction) texture(ENVIRONMENT_TEXTURE, EquirectangularByCartesian(direction)).rgb
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
    vec3 radiance = mix(OriginalRadiance(R), BluryRadiance(R), pow(fresnel, vec3(15.)));
    vec3 diffuse = albedo * (irradiance * irradiance + irradiance);
    vec3 specular = radiance * radiance + radiance;

    return GammaExpansion(mix(diffuse, specular, fresnel));
  }

  vec3 Glass(in Ray camera, in Geometry geometry, in Material material) {
    #define Irradiance(normal) texture(IRRADIANCE_BUFFER, EquirectangularByCartesian(normal)).rgb
    #define BluryRadiance(direction) texture(RADIANCE_BUFFER, EquirectangularByCartesian(direction)).rgb
    #define OriginalRadiance(direction) texture(ENVIRONMENT_TEXTURE, EquirectangularByCartesian(direction)).rgb
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
    vec3 radiance = mix(OriginalRadiance(R), BluryRadiance(R), pow(fresnel, vec3(15.)));
    vec3 diffuse = albedo * albedo + albedo;
    vec3 specular = radiance * radiance + radiance;

    return GammaExpansion(mix(diffuse, specular, fresnel));
  }

  vec3 Environment(vec3 direction) {
    vec3 color = texture(ENVIRONMENT_TEXTURE, EquirectangularByCartesian(direction)).rgb;
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

  vec3 PBR(Ray camera, Geometry geometry, Material material, Light light) {
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
    
    vec3 L = normalize(light.direction);
    vec3 H = normalize(V + L);
    float D = a2 / (PI * pow(pow(saturate(dot(N, H)), 2.) * (a2 - 1.) + 1., 2.));
    float G = 1. / mix(saturate(dot(N, L)), 1., k) * mix(saturate(dot(N, V)), 1., k);
    vec3 F = mix(vec3(pow(1. - saturate(dot(L, H)), 5.)), vec3(1), Fo);
    vec3 radiance = light.color;
    
    return mix(diffuse, vec3(D * G / 4.), F) * radiance * saturate(dot(N, L));
  }

  vec3 JumpFlooding(vec2 uv) {
    float wavesDistance = length(texture(JUMP_FLOODING_BUFFER, uv).r) * 200.;
    float costa = 40.;
    if (wavesDistance < costa) return GammaExpansion(vec3(abs(sin(wavesDistance - iTime * 0.001)) * smoothstep(0., 1., (1. - wavesDistance / costa))));
    else return vec3(0.);
  }
  float OutlineA(vec2 uv) {
    float wavesDistance = length(texture(JUMP_FLOODING_BUFFER, uv).r) * 200.;
    return wavesDistance < 3.15 ? 1. : 0.;
  }
    
  float OutlineB(vec2 uv) {
    float wavesDistance = length(texture(JUMP_FLOODING_BUFFER, uv).r) * 200.;
    return wavesDistance < 3.1 ? 1. : 0.;
  }

  float Gradient(vec2 uv) {
    float wavesDistance = length(texture(JUMP_FLOODING_BUFFER, uv).r) * 200.;
    float costa = 20.;
    if (wavesDistance < costa) return smoothstep(0., 1., 1. - wavesDistance / costa);
    else return 0.;
  }
    

  vec3 Render(vec2 uv) {
    Ray camera = Camera(uv);
    Geometry planet = PlanetGeometry(uv, camera);
    Geometry ocean = OceanGeometry(camera);
    Geometry atmosphere = AtmosphereGeometry(camera);

    // Out of the Atmosphere;
    vec3 environment;
    if (atmosphere.distance == FAR) return environment;
    
    // Atmosphere occlusion
    float path = atmosphere.path;
    if (min(planet.distance, ocean.distance) < FAR) path = abs(atmosphere.distance - min(planet.distance, ocean.distance));
    vec3 light = (GammaExpansion(saturate(AtmosphereLight(Ray(atmosphere.position, camera.direction), path))));
    
    // Atmosphere
    if (min(planet.distance, ocean.distance) > .9 * FAR) return mix(environment, light, light);
    vec3 color;
    
    // Planet
    if (planet.distance < .9 * FAR) {
      vec3 bakedIrradiance = texture(PATH_TRACER_BUFFER, planet.coord).rgb /* / float(min(iFrame, 200))*/;
      vec3 irradiance = GammaExpansion(bakedIrradiance) * 2.;
      float ao = GammaExpansion(texture(PATH_TRACER_OCCLUSION_BUFFER, planet.coord).rgb).r;
      float shadows = texture(GEOMETRY_BUFFER, uv).a;

      vec2 spherical = SphericalByEquirectangular(planet.coord);
   
      vec3 elevation = TurboColorPallete(smoothstep(0., 1., texture(ELEVATION_BUFFER, planet.coord).r));
      vec3 albedo = (Basemap(spherical));
      
      //float t = texture(ELEVATION_BUFFER, coord).r;
      //t = abs(sin(t * 200.));
      //albedo = (elevation);
      Material material = Material(vec3(albedo), 1.0, 0., .0);
    
      vec3 indirect = IBLBaked(camera, planet, material, (irradiance), ao) * mix(.5, 1., shadows) * pow(ao, .1) * mix(.8, 1., ao);
      vec3 direct = PBR(camera, planet, material, SUN) * ao * shadows;

      color = mix(indirect, direct, direct);
   }

   // Ocean
   if (ocean.distance < FAR && planet.distance > ocean.distance) {     
      vec3 aWave = texture(WAVE_B_TEXTURE, ocean.coord * 40. + vec2(iTime * .00005, 0)).rgb;
      vec3 bWave = texture(WAVE_A_TEXTURE, ocean.coord * 40. + vec2(0, iTime * .00005)).rgb;
      vec3 tangent = normalize(cross(ocean.normal, vec3(0.0, 1.0, 0.0)));
      vec3 bitangent = cross(ocean.normal, tangent);
      mat3 TBN = mat3(tangent, bitangent, ocean.normal);
      ocean.normal = normalize(TBN * normalize(mix(aWave, bWave, .5)));
      vec3 toonWaves = JumpFlooding(ocean.coord);

      float thickness = pow(abs(planet.distance - ocean.distance), 1.);
      float beerlambert = pow(saturate(exp(- 10. * thickness)), 1.);
      vec3 albedo = mix(GammaExpansion(TurboColorPallete(0.)), (color), beerlambert);

      
      vec2 spherical = SphericalByEquirectangular(planet.coord);
   
      vec3 basemap = (Basemap(spherical));
      
      float outlineA = OutlineA(ocean.coord);
      float outlineB = OutlineB(ocean.coord);

      albedo = mix(albedo, toonWaves, toonWaves * .3);
      albedo = mix(albedo, vec3(1), outlineA);
      albedo = mix(albedo, vec3(0), outlineB);

      Material material = Material(GammaCompression(albedo), 0., 0., .16);
      vec3 indirect = IBL(camera, ocean, material);
      vec3 direct = PBR(camera, ocean, material, SUN);
      vec3 light = mix(indirect, direct, direct);

      color = mix(color, light, 1. - beerlambert);

     // color = mix(color, toonWaves, (ocean.normal.y * .5 + .5) * (ocean.normal.x * .5 + .5) * (ocean.normal.z * .5 + .5));
      
   }
    return mix(color, light, light);
  }

  vec4 Pixel(vec2 uv) { return vec4(GammaCompression(Render(uv)), 0); }`
)

const image = Pixel(
  `uniform highp sampler2D PATH_TRACED_BUFFER;
  uniform highp sampler2D PATH_TRACER_BUFFER;
  
  uniform float iTime;
  uniform int iFrame;
 
  #define GammaExpansion(color) pow(vec3(color), vec3(2.2))
  #define GammaCompression(color) pow(vec3(color), vec3(1. / 2.2))
  #define EncodeVec2(xy) uintBitsToFloat(packHalf2x16(xy))
  #define DecodeVec2(packedFloat) unpackHalf2x16(floatBitsToUint(packedFloat))
    

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

  vec4 Pixel(vec2 uv) {
    //return vec4((texture(PATH_TRACER_BUFFER, uv).rgb / (float(iFrame) + 1.)), 1.);
    //return vec4(((texture(GEOMETRY_BUFFER, uv).rgb)), 1.);
    //return vec4(((texture(PATH_TRACER_BUFFER, uv).rgb / float(iFrame))), 1.);
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
//brdf()
//irradiance()
//radiance()

const lerp = (a, b, t) => (t < 0 ? a : t > 1 ? b : (1 - t) * a + t * b)
const byFrame = timestamp => {
  // GlobalUniformComponents.get('iZoom')[1] = lerp(1, 0, Math.cos(timestamp * 0.0002) * 0.5 + 0.5)
  UpdateCameraSystem()
  BasemapSystem()
  view()
  geometry()
  // normals()
  //pathTracer()
  light()
  //if (GlobalUniformComponents.get('iFrame')[1] < 600) jumpFlooding()
  image()
  GlobalUniformComponents.get('iTime')[1] = timestamp
  GlobalUniformComponents.get('iFrame')[1]++
  requestAnimationFrame(byFrame)
}
requestAnimationFrame(byFrame)
