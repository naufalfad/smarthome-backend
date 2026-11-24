import os

def generate_svg():
    WIDTH = 2500
    HEIGHT = 3000
    SCALE = 170.0
    OX = 400
    OY = 380

    def m2px(xm, ym):
        return int(OX + xm * SCALE), int(OY + ym * SCALE)

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}">')
    svg.append('  <style>')
    svg.append('    .bg { fill: #ffffff; }')
    svg.append('    .sheet-border-outer { fill: none; stroke: #cbd5e1; stroke-width: 2; }')
    svg.append('    .sheet-border-inner { fill: none; stroke: #94a3b8; stroke-width: 1; }')
    svg.append('    .wall { fill: #1e293b; stroke: #0f172a; stroke-width: 2; }')
    svg.append('    .wall-interior { fill: #334155; stroke: #0f172a; stroke-width: 1.5; }')
    svg.append('    .window-frame { fill: #ffffff; stroke: #0f172a; stroke-width: 2; }')
    svg.append('    .window-glass { stroke: #38bdf8; stroke-width: 3; }')
    svg.append('    .window-sill { stroke: #475569; stroke-width: 2; }')
    svg.append('    .door-leaf { stroke: #1e293b; stroke-width: 4; stroke-linecap: round; }')
    svg.append('    .door-arc { fill: none; stroke: #94a3b8; stroke-width: 2; stroke-dasharray: 4 3; }')
    svg.append('    .furniture-outline { fill: #f8fafc; stroke: #94a3b8; stroke-width: 1.5; }')
    svg.append('    .dim-line { stroke: #64748b; stroke-width: 2; }')
    svg.append('    .dim-tick { stroke: #64748b; stroke-width: 2; }')
    svg.append('    .dim-ext { stroke: #94a3b8; stroke-width: 1; }')
    svg.append('    .dim-text { font-family: "Segoe UI", Arial, sans-serif; font-size: 20px; font-weight: bold; fill: #1e293b; text-anchor: middle; dominant-baseline: middle; }')
    svg.append('    .room-label-bg { fill: #ffffff; stroke: #cbd5e1; stroke-width: 2; rx: 12; }')
    svg.append('    .room-title { font-family: "Segoe UI", Arial, sans-serif; font-size: 24px; font-weight: bold; fill: #0f172a; text-anchor: middle; }')
    svg.append('    .room-sub { font-family: "Segoe UI", Arial, sans-serif; font-size: 18px; fill: #64748b; text-anchor: middle; }')
    svg.append('    .tb-border { fill: #ffffff; stroke: #0f172a; stroke-width: 3; }')
    svg.append('    .tb-divider { stroke: #cbd5e1; stroke-width: 1.5; }')
    svg.append('    .tb-title { font-family: "Segoe UI", Arial, sans-serif; font-size: 34px; font-weight: bold; fill: #0f172a; }')
    svg.append('    .tb-sub { font-family: "Segoe UI", Arial, sans-serif; font-size: 20px; fill: #475569; }')
    svg.append('    .tb-label { font-family: "Segoe UI", Arial, sans-serif; font-size: 15px; fill: #64748b; }')
    svg.append('    .tb-val { font-family: "Segoe UI", Arial, sans-serif; font-size: 18px; font-weight: bold; fill: #0f172a; }')
    svg.append('  </style>')

    # Background
    svg.append(f'  <rect class="bg" width="{WIDTH}" height="{HEIGHT}" />')
    svg.append(f'  <rect class="sheet-border-outer" x="60" y="60" width="{WIDTH-120}" height="{HEIGHT-120}" />')
    svg.append(f'  <rect class="sheet-border-inner" x="70" y="70" width="{WIDTH-140}" height="{HEIGHT-140}" />')

    # Room Floortints
    rooms = [
        ("KITCHEN", 0.0, 0.0, 4.5, 3.8, "#f8fafc"),
        ("DINING ROOM", 0.0, 3.8, 4.5, 7.0, "#fefcf8"),
        ("LIVING ROOM", 0.0, 7.0, 4.5, 12.0, "#f8fafc"),
        ("BATHROOM", 4.5, 0.0, 6.8, 2.5, "#f0f9ff"),
        ("HALLWAY", 4.5, 2.5, 6.0, 8.0, "#ffffff"),
        ("BEDROOM 2", 6.8, 0.0, 10.0, 4.8, "#fefcf8"),
        ("BEDROOM 1", 6.0, 4.8, 10.0, 11.0, "#f8fafc"),
        ("FRONT TERRACE", 6.0, 11.0, 10.0, 12.0, "#f1f5f9"),
        ("FOYER", 4.5, 8.0, 6.0, 12.0, "#ffffff"),
    ]
    svg.append('  <!-- Room Floor Surfaces -->')
    svg.append('  <g id="room-surfaces">')
    for name, x1, y1, x2, y2, bg in rooms:
        px1, py1 = m2px(x1, y1)
        px2, py2 = m2px(x2, y2)
        svg.append(f'    <rect x="{px1}" y="{py1}" width="{px2-px1}" height="{py2-py1}" fill="{bg}" />')
    svg.append('  </g>')

    # Furniture Outlines
    svg.append('  <!-- Reference Furniture -->')
    svg.append('  <g id="reference-furniture">')
    # Living Room Sofa
    sx1, sy1 = m2px(0.25, 8.0)
    sx2, sy2 = m2px(1.15, 10.4)
    svg.append(f'    <rect class="furniture-outline" x="{sx1}" y="{sy1}" width="{sx2-sx1}" height="{sy2-sy1}" rx="8" />')
    svg.append(f'    <rect x="{sx1}" y="{sy1}" width="35" height="{sy2-sy1}" fill="#e2e8f0" stroke="#94a3b8" />')
    # Coffee Table
    cx1, cy1 = m2px(1.5, 8.6)
    cx2, cy2 = m2px(2.7, 9.8)
    svg.append(f'    <rect class="furniture-outline" x="{cx1}" y="{cy1}" width="{cx2-cx1}" height="{cy2-cy1}" rx="6" />')
    # TV Console
    tx1, ty1 = m2px(3.9, 8.2)
    tx2, ty2 = m2px(4.35, 10.2)
    svg.append(f'    <rect class="furniture-outline" x="{tx1}" y="{ty1}" width="{tx2-tx1}" height="{ty2-ty1}" />')
    # Dining Table & Chairs
    dx1, dy1 = m2px(1.2, 4.6)
    dx2, dy2 = m2px(3.0, 6.2)
    svg.append(f'    <rect class="furniture-outline" x="{dx1}" y="{dy1}" width="{dx2-dx1}" height="{dy2-dy1}" rx="6" />')
    for cx in [1.5, 2.1, 2.7]:
        c1 = m2px(cx-0.22, 4.25)
        c2 = m2px(cx+0.22, 4.55)
        svg.append(f'    <rect class="furniture-outline" x="{c1[0]}" y="{c1[1]}" width="{c2[0]-c1[0]}" height="{c2[1]-c1[1]}" rx="3" />')
        c1b = m2px(cx-0.22, 6.25)
        c2b = m2px(cx+0.22, 6.55)
        svg.append(f'    <rect class="furniture-outline" x="{c1b[0]}" y="{c1b[1]}" width="{c2b[0]-c1b[0]}" height="{c2b[1]-c1b[1]}" rx="3" />')
    # Kitchen Counters
    kx1, ky1 = m2px(0.2, 0.2)
    kx2, ky2 = m2px(4.3, 0.85)
    svg.append(f'    <rect class="furniture-outline" x="{kx1}" y="{ky1}" width="{kx2-kx1}" height="{ky2-ky1}" />')
    wx1, wy1 = m2px(0.2, 0.85)
    wx2, wy2 = m2px(0.85, 2.8)
    svg.append(f'    <rect class="furniture-outline" x="{wx1}" y="{wy1}" width="{wx2-wx1}" height="{wy2-wy1}" />')
    # Sink
    sk1, sk2 = m2px(2.0, 0.28), m2px(2.8, 0.78)
    svg.append(f'    <rect fill="#ffffff" stroke="#475569" stroke-width="2" x="{sk1[0]}" y="{sk1[1]}" width="{sk2[0]-sk1[0]}" height="{sk2[1]-sk1[1]}" rx="4" />')
    mid_s = (sk1[0] + sk2[0]) // 2
    svg.append(f'    <rect fill="none" stroke="#64748b" x="{sk1[0]+6}" y="{sk1[1]+6}" width="{mid_s-sk1[0]-10}" height="{sk2[1]-sk1[1]-12}" />')
    svg.append(f'    <rect fill="none" stroke="#64748b" x="{mid_s+4}" y="{sk1[1]+6}" width="{sk2[0]-mid_s-10}" height="{sk2[1]-sk1[1]-12}" />')
    # Stove
    st1, st2 = m2px(1.0, 0.3), m2px(1.7, 0.76)
    svg.append(f'    <rect fill="#e2e8f0" stroke="#475569" stroke-width="1.5" x="{st1[0]}" y="{st1[1]}" width="{st2[0]-st1[0]}" height="{st2[1]-st1[1]}" rx="4" />')
    for bx, by in [(1.2, 0.42), (1.5, 0.42), (1.2, 0.64), (1.5, 0.64)]:
        bpx, bpy = m2px(bx, by)
        svg.append(f'    <circle cx="{bpx}" cy="{bpy}" r="14" fill="none" stroke="#475569" stroke-width="2" />')
    # Fridge
    fr1, fr2 = m2px(3.5, 0.25), m2px(4.25, 0.85)
    svg.append(f'    <rect fill="#e2e8f0" stroke="#475569" stroke-width="2" x="{fr1[0]}" y="{fr1[1]}" width="{fr2[0]-fr1[0]}" height="{fr2[1]-fr1[1]}" />')
    svg.append(f'    <line x1="{fr1[0]}" y1="{fr1[1]}" x2="{fr2[0]}" y2="{fr2[1]}" stroke="#94a3b8" />')
    svg.append(f'    <line x1="{fr1[0]}" y1="{fr2[1]}" x2="{fr2[0]}" y2="{fr1[1]}" stroke="#94a3b8" />')
    # Bathroom Fixtures
    sh1, sh2 = m2px(4.7, 0.2), m2px(5.7, 1.3)
    svg.append(f'    <rect fill="#f0f9ff" stroke="#38bdf8" stroke-width="2" x="{sh1[0]}" y="{sh1[1]}" width="{sh2[0]-sh1[0]}" height="{sh2[1]-sh1[1]}" />')
    dr1 = m2px(5.2, 0.75)
    svg.append(f'    <circle cx="{dr1[0]}" cy="{dr1[1]}" r="12" fill="none" stroke="#64748b" stroke-width="2" />')
    # Toilet
    tl1, tl2 = m2px(6.1, 0.2), m2px(6.6, 0.5)
    svg.append(f'    <rect fill="#ffffff" stroke="#64748b" stroke-width="2" x="{tl1[0]}" y="{tl1[1]}" width="{tl2[0]-tl1[0]}" height="{tl2[1]-tl1[1]}" rx="2" />')
    tb1, tb2 = m2px(6.15, 0.5), m2px(6.55, 0.95)
    svg.append(f'    <ellipse cx="{(tb1[0]+tb2[0])//2}" cy="{(tb1[1]+tb2[1])//2}" rx="{(tb2[0]-tb1[0])//2}" ry="{(tb2[1]-tb1[1])//2}" fill="#ffffff" stroke="#64748b" stroke-width="2" />')
    # Vanity
    vn1, vn2 = m2px(4.7, 1.8), m2px(5.6, 2.3)
    svg.append(f'    <rect fill="#ffffff" stroke="#64748b" stroke-width="2" x="{vn1[0]}" y="{vn1[1]}" width="{vn2[0]-vn1[0]}" height="{vn2[1]-vn1[1]}" rx="3" />')
    sn1, sn2 = m2px(4.9, 1.9), m2px(5.4, 2.2)
    svg.append(f'    <ellipse cx="{(sn1[0]+sn2[0])//2}" cy="{(sn1[1]+sn2[1])//2}" rx="{(sn2[0]-sn1[0])//2}" ry="{(sn2[1]-sn1[1])//2}" fill="#f8fafc" stroke="#475569" stroke-width="1.5" />')
    # Beds
    # Bed 2
    b2_1, b2_2 = m2px(7.4, 0.3), m2px(9.2, 2.4)
    svg.append(f'    <rect class="furniture-outline" x="{b2_1[0]}" y="{b2_1[1]}" width="{b2_2[0]-b2_1[0]}" height="{b2_2[1]-b2_1[1]}" rx="6" />')
    svg.append(f'    <rect fill="#e2e8f0" stroke="#64748b" x="{b2_1[0]}" y="{b2_1[1]}" width="{b2_2[0]-b2_1[0]}" height="25" />')
    # Master Bed
    mb1, mb2 = m2px(7.2, 6.0), m2px(9.2, 8.2)
    svg.append(f'    <rect class="furniture-outline" x="{mb1[0]}" y="{mb1[1]}" width="{mb2[0]-mb1[0]}" height="{mb2[1]-mb1[1]}" rx="8" />')
    svg.append(f'    <rect fill="#e2e8f0" stroke="#64748b" x="{mb1[0]}" y="{mb1[1]}" width="{mb2[0]-mb1[0]}" height="25" />')
    svg.append('  </g>')

    # Walls
    def wall_svg(x1_m, y1_m, x2_m, y2_m, thick_px=18, is_ext=False):
        p1 = m2px(x1_m, y1_m)
        p2 = m2px(x2_m, y2_m)
        min_x, max_x = min(p1[0], p2[0]), max(p1[0], p2[0])
        min_y, max_y = min(p1[1], p2[1]), max(p1[1], p2[1])
        if max_x - min_x < thick_px:
            min_x -= thick_px // 2
            max_x += thick_px // 2
        if max_y - min_y < thick_px:
            min_y -= thick_px // 2
            max_y += thick_px // 2
        cls = "wall" if is_ext else "wall-interior"
        return f'    <rect class="{cls}" x="{min_x}" y="{min_y}" width="{max_x-min_x}" height="{max_y-min_y}" />'

    svg.append('  <!-- Architectural Walls -->')
    svg.append('  <g id="walls">')
    # Exterior walls
    svg.append(wall_svg(0.0, 0.0, 1.8, 0.0, 24, True))
    svg.append(wall_svg(3.2, 0.0, 3.5, 0.0, 24, True))
    svg.append(wall_svg(4.4, 0.0, 4.8, 0.0, 24, True))
    svg.append(wall_svg(5.6, 0.0, 7.5, 0.0, 24, True))
    svg.append(wall_svg(8.8, 0.0, 10.0, 0.0, 24, True))
    svg.append(wall_svg(0.0, 0.0, 0.0, 1.2, 24, True))
    svg.append(wall_svg(0.0, 2.4, 0.0, 4.5, 24, True))
    svg.append(wall_svg(0.0, 5.8, 0.0, 7.8, 24, True))
    svg.append(wall_svg(0.0, 9.8, 0.0, 12.0, 24, True))
    svg.append(wall_svg(0.0, 12.0, 1.5, 12.0, 24, True))
    svg.append(wall_svg(2.8, 12.0, 3.5, 12.0, 24, True))
    svg.append(wall_svg(5.8, 12.0, 6.2, 12.0, 24, True))
    svg.append(wall_svg(9.8, 12.0, 10.0, 12.0, 24, True))
    svg.append(wall_svg(10.0, 0.0, 10.0, 1.5, 24, True))
    svg.append(wall_svg(10.0, 2.8, 10.0, 6.0, 24, True))
    svg.append(wall_svg(10.0, 7.5, 10.0, 11.0, 24, True))
    svg.append(wall_svg(10.0, 11.0, 10.0, 12.0, 24, True))
    # Interior dividing walls
    svg.append(wall_svg(4.5, 0.0, 4.5, 1.7, 18, False))
    svg.append(wall_svg(4.5, 2.6, 4.5, 7.0, 18, False))
    svg.append(wall_svg(4.5, 7.0, 4.5, 8.5, 18, False))
    svg.append(wall_svg(4.5, 10.5, 4.5, 12.0, 18, False))
    svg.append(wall_svg(5.7, 2.5, 6.8, 2.5, 18, False))
    svg.append(wall_svg(6.8, 0.0, 6.8, 3.5, 18, False))
    svg.append(wall_svg(6.0, 4.8, 10.0, 4.8, 18, False))
    svg.append(wall_svg(6.0, 4.8, 6.0, 5.2, 18, False))
    svg.append(wall_svg(6.0, 6.2, 6.0, 11.0, 18, False))
    svg.append(wall_svg(6.0, 11.0, 7.2, 11.0, 20, False))
    svg.append(wall_svg(8.8, 11.0, 10.0, 11.0, 20, False))
    svg.append('  </g>')

    # Windows
    def window_svg(x1_m, y1_m, x2_m, y2_m, is_horiz=True):
        p1 = m2px(x1_m, y1_m)
        p2 = m2px(x2_m, y2_m)
        res = []
        if is_horiz:
            ym = p1[1]
            res.append(f'    <rect class="window-frame" x="{p1[0]}" y="{ym-12}" width="{p2[0]-p1[0]}" height="24" />')
            res.append(f'    <line class="window-glass" x1="{p1[0]}" y1="{ym-4}" x2="{p2[0]}" y2="{ym-4}" />')
            res.append(f'    <line class="window-glass" x1="{p1[0]}" y1="{ym+4}" x2="{p2[0]}" y2="{ym+4}" />')
            res.append(f'    <line class="window-sill" x1="{p1[0]-6}" y1="{ym-15}" x2="{p2[0]+6}" y2="{ym-15}" />')
        else:
            xm = p1[0]
            res.append(f'    <rect class="window-frame" x="{xm-12}" y="{p1[1]}" width="24" height="{p2[1]-p1[1]}" />')
            res.append(f'    <line class="window-glass" x1="{xm-4}" y1="{p1[1]}" x2="{xm-4}" y2="{p2[1]}" />')
            res.append(f'    <line class="window-glass" x1="{xm+4}" y1="{p1[1]}" x2="{xm+4}" y2="{p2[1]}" />')
            res.append(f'    <line class="window-sill" x1="{xm-15}" y1="{p1[1]-6}" x2="{xm-15}" y2="{p2[1]+6}" />')
        return "\n".join(res)

    svg.append('  <!-- Architectural Windows -->')
    svg.append('  <g id="windows">')
    svg.append(window_svg(1.8, 0.0, 3.2, 0.0, True))
    svg.append(window_svg(4.8, 0.0, 5.6, 0.0, True))
    svg.append(window_svg(7.5, 0.0, 8.8, 0.0, True))
    svg.append(window_svg(0.0, 1.2, 0.0, 2.4, False))
    svg.append(window_svg(0.0, 4.5, 0.0, 5.8, False))
    svg.append(window_svg(0.0, 7.8, 0.0, 9.8, False))
    svg.append(window_svg(10.0, 1.5, 10.0, 2.8, False))
    svg.append(window_svg(10.0, 6.0, 10.0, 7.5, False))
    svg.append(window_svg(1.5, 12.0, 2.8, 12.0, True))
    svg.append(window_svg(7.2, 11.0, 8.8, 11.0, True))
    svg.append('  </g>')

    # Doors
    def door_svg(hx_m, hy_m, width_m, arc_type, lx_m, ly_m):
        hx, hy = m2px(hx_m, hy_m)
        lx, ly = m2px(lx_m, ly_m)
        r = int(width_m * SCALE)
        # arc_type: 1=270to360, 2=180to270, 3=0to90
        if arc_type == 1:
            d = f'M {hx} {hy-r} A {r} {r} 0 0 1 {hx+r} {hy}'
        elif arc_type == 2:
            d = f'M {hx-r} {hy} A {r} {r} 0 0 1 {hx} {hy-r}'
        elif arc_type == 3:
            d = f'M {hx+r} {hy} A {r} {r} 0 0 1 {hx} {hy+r}'
        else:
            d = f'M {hx} {hy-r} A {r} {r} 0 0 1 {hx+r} {hy}'
        return f'    <path class="door-arc" d="{d}" />\n    <line class="door-leaf" x1="{hx}" y1="{hy}" x2="{lx}" y2="{ly}" />'

    svg.append('  <!-- Doors with Swing Arcs -->')
    svg.append('  <g id="doors">')
    # Main double door
    svg.append(door_svg(3.5, 12.0, 0.6, 1, 3.5, 11.4))
    svg.append(door_svg(4.7, 12.0, 0.6, 2, 4.7, 11.4))
    # Kitchen backdoor
    svg.append(door_svg(3.5, 0.0, 0.9, 3, 4.4, 0.0))
    # Bathroom door
    svg.append(door_svg(4.8, 2.5, 0.85, 1, 4.8, 1.65))
    # Bedroom 2 door
    svg.append(door_svg(6.8, 3.5, 0.9, 3, 7.7, 3.5))
    # Master Bedroom door
    svg.append(door_svg(6.0, 5.2, 0.9, 3, 6.9, 5.2))
    svg.append('  </g>')

    # Room Labels Badges
    label_locs = [
        ("KITCHEN", "4.50 × 3.80 m", "17.10 m²", 2.4, 2.2),
        ("DINING ROOM", "4.50 × 3.20 m", "14.40 m²", 3.6, 5.4),
        ("LIVING ROOM", "4.50 × 5.00 m", "22.50 m²", 2.4, 11.0),
        ("BATHROOM", "2.30 × 2.50 m", "5.75 m²", 5.7, 1.6),
        ("HALLWAY", "1.50 × 5.50 m", "8.25 m²", 5.25, 5.2),
        ("BEDROOM 2", "3.20 × 4.80 m", "15.36 m²", 8.4, 2.6),
        ("BEDROOM 1 (MASTER)", "4.00 × 6.20 m", "24.80 m²", 8.0, 9.0),
    ]
    svg.append('  <!-- Room Identification Badges -->')
    svg.append('  <g id="room-badges">')
    for name, dim, area, cx_m, cy_m in label_locs:
        cx, cy = m2px(cx_m, cy_m)
        bw, bh = 240, 84
        svg.append(f'    <rect class="room-label-bg" x="{cx-bw//2}" y="{cy-bh//2}" width="{bw}" height="{bh}" />')
        svg.append(f'    <text class="room-title" x="{cx}" y="{cy-8}">{name}</text>')
        svg.append(f'    <text class="room-sub" x="{cx}" y="{cy+24}">{dim} • {area}</text>')
    svg.append('  </g>')

    # Dimensions
    def dim_h_svg(y_px, x1_m, x2_m, text):
        p1 = m2px(x1_m, 0)[0]
        p2 = m2px(x2_m, 0)[0]
        mid = (p1 + p2) // 2
        return (
            f'    <line class="dim-line" x1="{p1}" y1="{y_px}" x2="{p2}" y2="{y_px}" />\n'
            f'    <line class="dim-tick" x1="{p1-8}" y1="{y_px+8}" x2="{p1+8}" y2="{y_px-8}" />\n'
            f'    <line class="dim-tick" x1="{p2-8}" y1="{y_px+8}" x2="{p2+8}" y2="{y_px-8}" />\n'
            f'    <line class="dim-ext" x1="{p1}" y1="{y_px-15}" x2="{p1}" y2="{y_px+15}" />\n'
            f'    <line class="dim-ext" x1="{p2}" y1="{y_px-15}" x2="{p2}" y2="{y_px+15}" />\n'
            f'    <rect fill="#ffffff" x="{mid-65}" y="{y_px-14}" width="130" height="28" rx="4" />\n'
            f'    <text class="dim-text" x="{mid}" y="{y_px}">{text}</text>'
        )

    svg.append('  <!-- Dimension Strings -->')
    svg.append('  <g id="dimension-strings">')
    svg.append(dim_h_svg(OY - 60, 0.0, 4.5, "4.50 m"))
    svg.append(dim_h_svg(OY - 60, 4.5, 6.8, "2.30 m"))
    svg.append(dim_h_svg(OY - 60, 6.8, 10.0, "3.20 m"))
    svg.append(dim_h_svg(OY - 120, 0.0, 10.0, "10.00 m (LEBAR)"))
    bot_y = OY + int(12.0 * SCALE)
    svg.append(dim_h_svg(bot_y + 60, 0.0, 4.5, "4.50 m"))
    svg.append(dim_h_svg(bot_y + 60, 4.5, 6.0, "1.50 m"))
    svg.append(dim_h_svg(bot_y + 60, 6.0, 10.0, "4.00 m"))
    svg.append(dim_h_svg(bot_y + 120, 0.0, 10.0, "10.00 m TOTAL"))
    svg.append('  </g>')

    # Title Block
    TB_TOP = 2640
    TB_BOT = 2920
    TB_LEFT = 100
    TB_RIGHT = WIDTH - 100
    svg.append('  <!-- Architectural Title Block -->')
    svg.append('  <g id="title-block">')
    svg.append(f'    <rect class="tb-border" x="{TB_LEFT}" y="{TB_TOP}" width="{TB_RIGHT-TB_LEFT}" height="{TB_BOT-TB_TOP}" />')
    svg.append(f'    <line class="tb-divider" x1="{TB_LEFT+220}" y1="{TB_TOP}" x2="{TB_LEFT+220}" y2="{TB_BOT}" />')
    svg.append(f'    <line class="tb-divider" x1="{TB_RIGHT-450}" y1="{TB_TOP}" x2="{TB_RIGHT-450}" y2="{TB_BOT}" />')

    # North arrow
    ccx = TB_LEFT + 110
    ccy = TB_TOP + 120
    svg.append(f'    <circle cx="{ccx}" cy="{ccy}" r="48" fill="none" stroke="#475569" stroke-width="2" />')
    svg.append(f'    <polygon points="{ccx},{ccy-44} {ccx-16},{ccy+24} {ccx},{ccy+12}" fill="#0f172a" />')
    svg.append(f'    <polygon points="{ccx},{ccy-44} {ccx+16},{ccy+24} {ccx},{ccy+12}" fill="#94a3b8" />')
    svg.append(f'    <text x="{ccx}" y="{ccy-55}" class="room-title">N</text>')
    svg.append(f'    <text x="{ccx}" y="{ccy+72}" class="tb-label" text-anchor="middle">UTARA</text>')

    # Center text
    ctx = TB_LEFT + 250
    svg.append(f'    <text x="{ctx}" y="{TB_TOP+50}" class="tb-title">SMART HOME 2D STUDIO — SAMPLE ARCHITECTURAL PLAN</text>')
    svg.append(f'    <text x="{ctx}" y="{TB_TOP+95}" class="tb-sub">DENAH RUMAH TINGGAL 1 LANTAI (10.00 × 12.00 METER) — LUAS 120 M²</text>')
    svg.append(f'    <text x="{ctx}" y="{TB_TOP+145}" class="tb-val">SKALA GRAFIS: 1 : 50 (170 px = 1.00 m)</text>')

    # Scale bar blocks
    for i in range(5):
        bx = ctx + i * 170
        col = "#0f172a" if i % 2 == 0 else "#ffffff"
        svg.append(f'    <rect x="{bx}" y="{TB_TOP+165}" width="170" height="16" fill="{col}" stroke="#0f172a" stroke-width="2" />')
        svg.append(f'    <text x="{bx}" y="{TB_TOP+205}" class="tb-label">{i}m</text>')
    svg.append(f'    <text x="{ctx + 5*170}" y="{TB_TOP+205}" class="tb-label">5m</text>')

    # Right block details
    rmx = TB_RIGHT - 430
    svg.append(f'    <text x="{rmx}" y="{TB_TOP+45}" class="tb-label">LEMBAR GAMBAR:</text>')
    svg.append(f'    <text x="{rmx}" y="{TB_TOP+70}" class="tb-val">A-101 (DENAH LT. 1)</text>')
    svg.append(f'    <line class="tb-divider" x1="{TB_RIGHT-450}" y1="{TB_TOP+90}" x2="{TB_RIGHT}" y2="{TB_TOP+90}" />')
    svg.append(f'    <text x="{rmx}" y="{TB_TOP+125}" class="tb-label">RESOLUSI ASSET:</text>')
    svg.append(f'    <text x="{rmx}" y="{TB_TOP+150}" class="tb-val">2500 × 3000 PX (PORTRAIT)</text>')
    svg.append(f'    <line class="tb-divider" x1="{TB_RIGHT-450}" y1="{TB_TOP+175}" x2="{TB_RIGHT}" y2="{TB_TOP+175}" />')
    svg.append(f'    <text x="{rmx}" y="{TB_TOP+210}" class="tb-label">STATUS PENGUJIAN:</text>')
    svg.append(f'    <text x="{rmx}" y="{TB_TOP+235}" class="tb-val" fill="#10b981">SIAP UPLOAD &amp; KALIBRASI</text>')
    svg.append('  </g>')

    svg.append('</svg>')

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'sample-assets'))
    os.makedirs(out_dir, exist_ok=True)
    svg_path = os.path.join(out_dir, 'sample-house-floor-plan.svg')
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(svg))
    print(f"SVG generated successfully: {svg_path} ({os.path.getsize(svg_path)} bytes)")

if __name__ == '__main__':
    generate_svg()

