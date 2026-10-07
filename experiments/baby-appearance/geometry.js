(function (root) {
  'use strict';
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function intersects(a, b, gap = 0) {
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
      a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  }
  function contain(rect, area) {
    return { ...rect, x: clamp(rect.x, 0, area.width - rect.width),
      y: clamp(rect.y, 0, area.height - rect.height) };
  }
  // Keep a family at the same width across poses. Sleeping becomes lower,
  // rather than growing its head to fill the standing pose's height.
  function assetFor(family, pose, direction = 'right') {
    return family.views?.[pose]?.[direction] || family.poses[pose];
  }
  function dimensions(family, pose, standingHeight, direction = 'right') {
    const [, , w, h] = family.poses.stand.bounds;
    const [, , pw, ph] = family.poses[pose].bounds;
    const width = standingHeight * w / h;
    const height = width * ph / pw;
    const asset = assetFor(family, pose, direction);
    return { width: height * asset.bounds[2] / asset.bounds[3], height };
  }
  function bodyAt(foot, size, area) {
    return contain({ x: foot.x - size.width / 2, y: foot.y - size.height, ...size }, area);
  }
  function accessories(body, area, nameWidth) {
    const orbSize = 22, gap = 8, labelHeight = 22;
    const candidates = (width, height) => [
      { x: body.x + body.width + gap, y: body.y + body.height - height },
      { x: body.x - width - gap, y: body.y + body.height - height },
      { x: body.x + (body.width - width) / 2, y: body.y - height - gap },
      { x: body.x + (body.width - width) / 2, y: body.y + body.height + gap }
    ].map(p => contain({ ...p, width, height }, area));
    const orb = candidates(orbSize, orbSize).find(r => !intersects(r, body, 4));
    if (!orb) throw new Error('TRIAL_AREA_TOO_SMALL');
    const width = Math.min(nameWidth, 120);
    const positions = candidates(width, labelHeight);
    // Prefer below, then above, without pushing the baby away from the edge.
    const preferred = [positions[3], positions[2], positions[0], positions[1]];
    let label = preferred.find(r => !intersects(r, body, 4) && !intersects(r, orb, 4));
    if (!label) {
      for (let y = 0; y <= area.height - labelHeight && !label; y += 4) {
        for (let x = 0; x <= area.width - width; x += 4) {
          const r = { x, y, width, height: labelHeight };
          if (!intersects(r, body, 4) && !intersects(r, orb, 4)) { label = r; break; }
        }
      }
    }
    if (!label) throw new Error('TRIAL_AREA_TOO_SMALL');
    return { orb, label };
  }
  function sourcePoint(x, y, body, bounds) {
    if (x < body.x || y < body.y || x >= body.x + body.width || y >= body.y + body.height) return null;
    return { x: Math.floor(bounds[0] + (x - body.x) / body.width * bounds[2]),
      y: Math.floor(bounds[1] + (y - body.y) / body.height * bounds[3]) };
  }
  function alphaHit(x, y, body, bounds, pixels, imageWidth) {
    const p = sourcePoint(x, y, body, bounds);
    return p !== null && pixels[(p.y * imageWidth + p.x) * 4 + 3] >= 32;
  }
  const api = { clamp, intersects, contain, assetFor, dimensions, bodyAt, accessories, sourcePoint, alphaHit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AppearanceGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
