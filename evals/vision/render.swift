// Draws each case in cases.json to <outdir>/<id>.png with AppKit (all scripts render).
// swift evals/vision/render.swift <cases.json> <outdir>   (render.mjs wraps this)
import AppKit

struct Case: Decodable { let id: String; let kind: String; let lines: [String] }
let args = CommandLine.arguments
let cases = try JSONDecoder().decode([Case].self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let outDir = args[2]

var rng = SystemRandomNumberGenerator()
func rnd(_ a: CGFloat, _ b: CGFloat) -> CGFloat { CGFloat.random(in: a...b, using: &rng) }

func font(_ names: [String], _ size: CGFloat) -> NSFont {
  for n in names { if let f = NSFont(name: n, size: size) { return f } }
  return NSFont.systemFont(ofSize: size)
}
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: r, green: g, blue: b, alpha: a)
}
func isArabic(_ s: String) -> Bool { s.unicodeScalars.contains { (0x0600...0x06FF).contains($0.value) } }
func script(_ c: Case) -> String {
  let all = c.lines.joined()
  if isArabic(all) { return "arabic" }
  if all.unicodeScalars.contains(where: { (0x0900...0x097F).contains($0.value) }) { return "hindi" }
  if all.unicodeScalars.contains(where: { (0x3040...0x30FF).contains($0.value) || (0x4E00...0x9FFF).contains($0.value) }) { return "japanese" }
  return "latin"
}

func draw(_ c: Case) -> NSBitmapImageRep {
  let kind = c.kind
  let rtl = isArabic(c.lines.joined())
  var size = NSSize(width: 750, height: 1000)
  var f = font(["Helvetica Neue"], 30)
  var ink = color(0.1, 0.1, 0.1)
  var lineH: CGFloat = 1.4
  switch kind {
  case "receipt":
    size.width = 420; f = font(["Menlo-Regular", "Courier"], 22); ink = color(0.15, 0.15, 0.15)
  case "whiteboard":
    size = NSSize(width: 1100, height: 700); f = font(["MarkerFelt-Wide", "MarkerFelt-Thin", "Chalkboard"], 40)
    ink = Bool.random() ? color(0.1, 0.15, 0.5) : color(0.7, 0.1, 0.1); lineH = 1.5
  case "handwriting":
    size = NSSize(width: 800, height: 700); f = font(["BradleyHandITCTT-Bold", "Noteworthy-Bold", "Noteworthy-Light"], 34)
    ink = color(0.1, 0.2, 0.6); lineH = 1.6
  case "printed":
    size = NSSize(width: 900, height: 600); lineH = 1.6
    switch script(c) {
    case "arabic": f = font(["GeezaPro", "Geeza Pro"], 36)
    case "hindi": f = font(["DevanagariSangamMN", "Kohinoor Devanagari", "KohinoorDevanagari-Regular"], 36)
    case "japanese": f = font(["HiraginoSans-W3", "Hiragino Sans W3", "HiraginoSans-W4"], 36)
    default: f = font(["Helvetica"], 36)
    }
  default: break
  }
  let m: CGFloat = kind == "receipt" ? 30 : 50
  let para = NSMutableParagraphStyle()
  para.lineBreakMode = .byWordWrapping
  if rtl { para.alignment = .right; para.baseWritingDirection = .rightToLeft }
  let attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: ink, .paragraphStyle: para]
  let step = f.ascender - f.descender + f.leading
  let text = NSAttributedString(string: c.lines.joined(separator: "\n"), attributes: attrs)

  if kind == "screenshot" {
    size.height = max(500, m * 2 + CGFloat(c.lines.count) * 150 + 40)
  } else if kind == "receipt" {
    let h = text.boundingRect(with: NSSize(width: size.width - 2 * m, height: 5000), options: [.usesLineFragmentOrigin]).height
    size.height = h * lineH / 1.2 + 2 * m + 20
  }
  _ = step

  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = size
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let full = NSRect(origin: .zero, size: size)

  switch kind {
  case "receipt": color(0.97, 0.95, 0.89).setFill()
  case "whiteboard": color(0.92, 0.93, 0.94).setFill()
  case "handwriting": color(0.99, 0.98, 0.93).setFill()
  default: NSColor.white.setFill()
  }
  full.fill()

  if kind == "receipt" {
    for _ in 0..<500 { color(0.5, 0.5, 0.5, rnd(0.1, 0.4)).setFill(); NSRect(x: rnd(0, size.width), y: rnd(0, size.height), width: rnd(1, 2.5), height: rnd(1, 2.5)).fill() }
  }
  if kind == "whiteboard" {
    for _ in 0..<12 { color(0.7, 0.72, 0.75, 0.12).setFill(); NSBezierPath(ovalIn: NSRect(x: rnd(0, size.width), y: rnd(0, size.height), width: rnd(60, 220), height: rnd(20, 80))).fill() }
  }
  if kind == "handwriting" {
    color(0.65, 0.78, 0.92, 0.9).setStroke()
    var y = m + 10
    while y < size.height { let p = NSBezierPath(); p.move(to: NSPoint(x: 0, y: y)); p.line(to: NSPoint(x: size.width, y: y)); p.lineWidth = 1.5; p.stroke(); y += 54 }
    color(0.9, 0.5, 0.5, 0.8).setStroke()
    let p = NSBezierPath(); p.move(to: NSPoint(x: 40, y: 0)); p.line(to: NSPoint(x: 40, y: size.height)); p.stroke()
  }

  if kind == "screenshot" {
    let status = NSAttributedString(string: "9:41", attributes: [.font: font(["HelveticaNeue-Bold"], 26), .foregroundColor: NSColor.black])
    status.draw(at: NSPoint(x: 40, y: size.height - 50))
    var y = size.height - 110
    for (i, line) in c.lines.enumerated() {
      let mine = line.hasPrefix("Me:")
      let box = NSRect(x: mine ? 90 : 30, y: y - 120, width: size.width - 120, height: 120)
      (mine ? color(0.0, 0.48, 1.0) : color(0.9, 0.9, 0.92)).setFill()
      NSBezierPath(roundedRect: box, xRadius: 28, yRadius: 28).fill()
      let a: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: mine ? NSColor.white : color(0.1, 0.1, 0.1), .paragraphStyle: para]
      NSAttributedString(string: line, attributes: a).draw(with: box.insetBy(dx: 22, dy: 14), options: [.usesLineFragmentOrigin])
      y -= 150; _ = i
    }
  } else {
    let rect = NSRect(x: m, y: m, width: size.width - 2 * m, height: size.height - 2 * m)
    let p2 = para.mutableCopy() as! NSMutableParagraphStyle
    p2.lineHeightMultiple = lineH / 1.2
    let s = NSMutableAttributedString(attributedString: text)
    s.addAttribute(.paragraphStyle, value: p2, range: NSRange(location: 0, length: s.length))
    let rot: CGFloat = kind == "receipt" ? 1.5 : kind == "handwriting" ? -2 : kind == "whiteboard" ? 1.2 : 0
    if rot != 0 {
      let t = NSAffineTransform(); t.translateX(by: size.width / 2, yBy: size.height / 2); t.rotate(byDegrees: rot); t.translateX(by: -size.width / 2, yBy: -size.height / 2); t.concat()
    }
    s.draw(with: rect, options: [.usesLineFragmentOrigin])
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
for c in cases {
  let rep = draw(c)
  try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(c.id).png"))
  print("rendered \(c.id)")
}
