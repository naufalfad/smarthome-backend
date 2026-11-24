import os
import math
from PIL import Image, ImageDraw, ImageFont

def generate_assets():
    WIDTH = 2500
    HEIGHT = 3000
    SCALE = 170.0  # 170 pixels = 1.0 meter

    # Building Origin (Top-left corner of outer building footprint)
    OX = 400
    OY = 380

    BLDG_WIDTH_M = 10.0
    BLDG_LENGTH_M = 12.0

    def m2px(xm, ym):
        return int(OX + xm * SCALE), int(OY + ym * SCALE)

    img = Image.new('RGB', (WIDTH, HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Fonts
    font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
    def get_font(name, size):
        path = os.path.join(font_dir, name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    f_title = get_font('segoeuib.ttf', 38)
    f_sub = get_font('segoeui.ttf', 20)
    f_room_name = get_font('segoeuib.ttf', 26)
    f_room_detail = get_font('segoeui.ttf', 19)
    f_dim = get_font('segoeuib.ttf', 20)
    f_block_label = get_font('segoeui.ttf', 15)
    f_block_val = get_font('segoeuib.ttf', 19)

    DIM_LINE_COLOR = (100, 116, 139)
    DIM_TEXT_COLOR = (30, 41, 59)

    # 1. Subtle Drawing Sheet Border
    draw.rectangle([60, 60, WIDTH - 60, HEIGHT - 60], outline=(203, 213, 225), width=2)
    draw.rectangle([70, 70, WIDTH - 70, HEIGHT - 70], outline=(148, 163, 184), width=1)

    # 2. Room Floor Shading
    rooms_data = [
        ("KITCHEN", "4.50 × 3.80 m", "17.10 m²", "-0.05", 0.0, 0.0, 4.5, 3.8, (248, 250, 252)),
        ("DINING ROOM", "4.50 × 3.20 m", "14.40 m²", "±0.00", 0.0, 3.8, 4.5, 7.0, (254, 252, 248)),
        ("LIVING ROOM", "4.50 × 5.00 m", "22.50 m²", "±0.00", 0.0, 7.0, 4.5, 12.0, (248, 250, 252)),
        ("BATHROOM", "2.30 × 2.50 m", "5.75 m²", "-0.05", 4.5, 0.0, 6.8, 2.5, (240, 249, 255)),
        ("HALLWAY", "1.50 × 5.50 m", "8.25 m²", "±0.00", 4.5, 2.5, 6.0, 8.0, (255, 255, 255)),
        ("BEDROOM 2", "3.20 × 4.80 m", "15.36 m²", "±0.00", 6.8, 0.0, 10.0, 4.8, (254, 252, 248)),
        ("BEDROOM 1 (MASTER)", "4.00 × 6.20 m", "24.80 m²", "±0.00", 6.0, 4.8, 10.0, 11.0, (248, 250, 252)),
        ("FRONT TERRACE", "4.00 × 1.00 m", "4.00 m²", "-0.15", 6.0, 11.0, 10.0, 12.0, (241, 245, 249)),
        ("FOYER", "1.50 × 4.00 m", "6.00 m²", "±0.00", 4.5, 8.0, 6.0, 12.0, (255, 255, 255)),
    ]

    for _, _, _, _, x1, y1, x2, y2, bg in rooms_data:
        px1, py1 = m2px(x1, y1)
        px2, py2 = m2px(x2, y2)
        draw.rectangle([px1, py1, px2, py2], fill=bg)

    # 3. Reference Furniture Outlines
    # Living Room Furniture
    sx1, sy1 = m2px(0.25, 8.0)
    sx2, sy2 = m2px(1.15, 10.4)
    draw.rectangle([sx1, sy1, sx2, sy2], outline=(148, 163, 184), fill=(241, 245, 249), width=2)
    draw.rectangle([sx1, sy1, sx1 + 35, sy2], outline=(148, 163, 184), fill=(226, 232, 240), width=1)
    
    cx1, cy1 = m2px(1.5, 8.6)
    cx2, cy2 = m2px(2.7, 9.8)
    draw.rectangle([cx1, cy1, cx2, cy2], outline=(148, 163, 184), fill=(255, 255, 255), width=2)
    
    tx1, ty1 = m2px(3.9, 8.2)
    tx2, ty2 = m2px(4.35, 10.2)
    draw.rectangle([tx1, ty1, tx2, ty2], outline=(148, 163, 184), fill=(241, 245, 249), width=2)
    draw.line([int((tx1+tx2)/2), ty1, int((tx1+tx2)/2), ty2], fill=(148, 163, 184), width=1)

    # Dining Table
    dx1, dy1 = m2px(1.2, 4.6)
    dx2, dy2 = m2px(3.0, 6.2)
    draw.rectangle([dx1, dy1, dx2, dy2], outline=(148, 163, 184), fill=(248, 250, 252), width=2)
    for cx in [1.5, 2.1, 2.7]:
        c_px1, c_py1 = m2px(cx - 0.22, 4.25)
        c_px2, c_py2 = m2px(cx + 0.22, 4.55)
        draw.rectangle([c_px1, c_py1, c_px2, c_py2], outline=(148, 163, 184), width=1)
        c_px1, c_py1 = m2px(cx - 0.22, 6.25)
        c_px2, c_py2 = m2px(cx + 0.22, 6.55)
        draw.rectangle([c_px1, c_py1, c_px2, c_py2], outline=(148, 163, 184), width=1)

    # Kitchen Counter & Fixtures
    kx1, ky1 = m2px(0.2, 0.2)
    kx2, ky2 = m2px(4.3, 0.85)
    draw.rectangle([kx1, ky1, kx2, ky2], outline=(100, 116, 139), fill=(241, 245, 249), width=2)
    wx1, wy1 = m2px(0.2, 0.85)
    wx2, wy2 = m2px(0.85, 2.8)
    draw.rectangle([wx1, wy1, wx2, wy2], outline=(100, 116, 139), fill=(241, 245, 249), width=2)
    
    skx1, sky1 = m2px(2.0, 0.28)
    skx2, sky2 = m2px(2.8, 0.78)
    draw.rectangle([skx1, sky1, skx2, sky2], outline=(71, 85, 105), fill=(255, 255, 255), width=2)
    mid_sk = int((skx1 + skx2) / 2)
    draw.rectangle([skx1 + 6, sky1 + 6, mid_sk - 4, sky2 - 6], outline=(100, 116, 139), width=1)
    draw.rectangle([mid_sk + 4, sky1 + 6, skx2 - 6, sky2 - 6], outline=(100, 116, 139), width=1)
    
    stx1, sty1 = m2px(1.0, 0.3)
    stx2, sty2 = m2px(1.7, 0.76)
    draw.rectangle([stx1, sty1, stx2, sty2], outline=(71, 85, 105), fill=(226, 232, 240), width=1)
    for bx, by in [(1.2, 0.42), (1.5, 0.42), (1.2, 0.64), (1.5, 0.64)]:
        bpx, bpy = m2px(bx, by)
        draw.circle((bpx, bpy), 14, outline=(71, 85, 105), width=2)
    
    rx1, ry1 = m2px(3.5, 0.25)
    rx2, ry2 = m2px(4.25, 0.85)
    draw.rectangle([rx1, ry1, rx2, ry2], outline=(71, 85, 105), fill=(226, 232, 240), width=2)
    draw.line([rx1, ry1, rx2, ry2], fill=(148, 163, 184), width=1)
    draw.line([rx1, ry2, rx2, ry1], fill=(148, 163, 184), width=1)

    # Bathroom Fixtures
    shx1, shy1 = m2px(4.7, 0.2)
    shx2, shy2 = m2px(5.7, 1.3)
    draw.rectangle([shx1, shy1, shx2, shy2], outline=(56, 189, 248), fill=(240, 249, 255), width=2)
    drx, dry = m2px(5.2, 0.75)
    draw.circle((drx, dry), 12, outline=(100, 116, 139), width=2)
    draw.line([shx1, shy2, shx2, shy2], fill=(14, 165, 233), width=3)
    
    tlx1, tly1 = m2px(6.1, 0.2)
    tlx2, tly2 = m2px(6.6, 0.5)
    draw.rectangle([tlx1, tly1, tlx2, tly2], outline=(100, 116, 139), fill=(255, 255, 255), width=2)
    bx1, by1 = m2px(6.15, 0.5)
    bx2, by2 = m2px(6.55, 0.95)
    draw.ellipse([bx1, by1, bx2, by2], outline=(100, 116, 139), fill=(255, 255, 255), width=2)
    
    vnx1, vny1 = m2px(4.7, 1.8)
    vnx2, vny2 = m2px(5.6, 2.3)
    draw.rectangle([vnx1, vny1, vnx2, vny2], outline=(100, 116, 139), fill=(255, 255, 255), width=2)
    snk1, snk2 = m2px(4.9, 1.9), m2px(5.4, 2.2)
    draw.ellipse([snk1[0], snk1[1], snk2[0], snk2[1]], outline=(71, 85, 105), width=1)

    # Bedroom 2
    bd2_1 = m2px(7.4, 0.3)
    bd2_2 = m2px(9.2, 2.4)
    draw.rectangle([bd2_1[0], bd2_1[1], bd2_2[0], bd2_2[1]], outline=(100, 116, 139), fill=(255, 255, 255), width=2)
    draw.rectangle([bd2_1[0], bd2_1[1], bd2_2[0], bd2_1[1] + 25], outline=(71, 85, 105), fill=(226, 232, 240), width=1)
    p1_a, p1_b = m2px(7.6, 0.5), m2px(8.2, 0.9)
    p2_a, p2_b = m2px(8.4, 0.5), m2px(9.0, 0.9)
    draw.rectangle([p1_a[0], p1_a[1], p1_b[0], p1_b[1]], outline=(148, 163, 184), fill=(241, 245, 249), width=1)
    draw.rectangle([p2_a[0], p2_a[1], p2_b[0], p2_b[1]], outline=(148, 163, 184), fill=(241, 245, 249), width=1)
    w2_1, w2_2 = m2px(7.0, 3.2), m2px(7.6, 4.5)
    draw.rectangle([w2_1[0], w2_1[1], w2_2[0], w2_2[1]], outline=(100, 116, 139), fill=(241, 245, 249), width=1)
    d2_1, d2_2 = m2px(8.6, 3.8), m2px(9.8, 4.45)
    draw.rectangle([d2_1[0], d2_1[1], d2_2[0], d2_2[1]], outline=(100, 116, 139), fill=(255, 255, 255), width=1)

    # Master Bedroom
    mb1 = m2px(7.2, 6.0)
    mb2 = m2px(9.2, 8.2)
    draw.rectangle([mb1[0], mb1[1], mb2[0], mb2[1]], outline=(100, 116, 139), fill=(255, 255, 255), width=2)
    draw.rectangle([mb1[0], mb1[1], mb2[0], mb1[1] + 25], outline=(71, 85, 105), fill=(226, 232, 240), width=1)
    mp1_a, mp1_b = m2px(7.4, 6.2), m2px(8.1, 6.7)
    mp2_a, mp2_b = m2px(8.3, 6.2), m2px(9.0, 6.7)
    draw.rectangle([mp1_a[0], mp1_a[1], mp1_b[0], mp1_b[1]], outline=(148, 163, 184), fill=(241, 245, 249), width=1)
    draw.rectangle([mp2_a[0], mp2_a[1], mp2_b[0], mp2_b[1]], outline=(148, 163, 184), fill=(241, 245, 249), width=1)
    ns1_a, ns1_b = m2px(6.6, 6.1), m2px(7.1, 6.7)
    ns2_a, ns2_b = m2px(9.3, 6.1), m2px(9.8, 6.7)
    draw.rectangle([ns1_a[0], ns1_a[1], ns1_b[0], ns1_b[1]], outline=(148, 163, 184), fill=(241, 245, 249), width=1)
    draw.rectangle([ns2_a[0], ns2_a[1], ns2_b[0], ns2_b[1]], outline=(148, 163, 184), fill=(241, 245, 249), width=1)
    wd1 = m2px(6.5, 9.8)
    wd2 = m2px(9.6, 10.5)
    draw.rectangle([wd1[0], wd1[1], wd2[0], wd2[1]], outline=(100, 116, 139), fill=(241, 245, 249), width=2)
    for div_x in [7.2, 8.0, 8.8]:
        dpx, dpy1 = m2px(div_x, 9.8)
        _, dpy2 = m2px(div_x, 10.5)
        draw.line([dpx, dpy1, dpx, dpy2], fill=(148, 163, 184), width=1)

    # 4. ARCHITECTURAL WALLS
    WALL_COLOR = (30, 41, 59)
    WALL_BORDER = (15, 23, 42)

    def draw_wall_rect(x1_m, y1_m, x2_m, y2_m, thick_px=18):
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
        draw.rectangle([min_x, min_y, max_x, max_y], fill=WALL_COLOR, outline=WALL_BORDER, width=2)

    # Exterior Wall Segments
    # North Wall (y = 0.0)
    draw_wall_rect(0.0, 0.0, 1.8, 0.0, 24)
    draw_wall_rect(3.2, 0.0, 3.5, 0.0, 24)
    draw_wall_rect(4.4, 0.0, 4.8, 0.0, 24)
    draw_wall_rect(5.6, 0.0, 7.5, 0.0, 24)
    draw_wall_rect(8.8, 0.0, 10.0, 0.0, 24)

    # West Wall (x = 0.0)
    draw_wall_rect(0.0, 0.0, 0.0, 1.2, 24)
    draw_wall_rect(0.0, 2.4, 0.0, 4.5, 24)
    draw_wall_rect(0.0, 5.8, 0.0, 7.8, 24)
    draw_wall_rect(0.0, 9.8, 0.0, 12.0, 24)

    # South Wall (y = 12.0)
    draw_wall_rect(0.0, 12.0, 1.5, 12.0, 24)
    draw_wall_rect(2.8, 12.0, 3.5, 12.0, 24)
    draw_wall_rect(5.8, 12.0, 6.2, 12.0, 24)
    draw_wall_rect(9.8, 12.0, 10.0, 12.0, 24)

    # East Wall (x = 10.0)
    draw_wall_rect(10.0, 0.0, 10.0, 1.5, 24)
    draw_wall_rect(10.0, 2.8, 10.0, 6.0, 24)
    draw_wall_rect(10.0, 7.5, 10.0, 11.0, 24)
    draw_wall_rect(10.0, 11.0, 10.0, 12.0, 24)

    # Interior Dividing Walls
    draw_wall_rect(4.5, 0.0, 4.5, 1.7, 18)
    draw_wall_rect(4.5, 2.6, 4.5, 7.0, 18)
    draw_wall_rect(4.5, 7.0, 4.5, 8.5, 18)
    draw_wall_rect(4.5, 10.5, 4.5, 12.0, 18)
    draw_wall_rect(5.7, 2.5, 6.8, 2.5, 18)
    draw_wall_rect(6.8, 0.0, 6.8, 3.5, 18)
    draw_wall_rect(6.0, 4.8, 10.0, 4.8, 18)
    draw_wall_rect(6.0, 4.8, 6.0, 5.2, 18)
    draw_wall_rect(6.0, 6.2, 6.0, 11.0, 18)
    draw_wall_rect(6.0, 11.0, 7.2, 11.0, 20)
    draw_wall_rect(8.8, 11.0, 10.0, 11.0, 20)

    # 5. WINDOWS
    def draw_window(x1_m, y1_m, x2_m, y2_m, is_horiz=True):
        p1 = m2px(x1_m, y1_m)
        p2 = m2px(x2_m, y2_m)
        if is_horiz:
            y_mid = p1[1]
            draw.rectangle([p1[0], y_mid - 12, p2[0], y_mid + 12], fill=(255, 255, 255), outline=(15, 23, 42), width=2)
            draw.line([p1[0], y_mid - 4, p2[0], y_mid - 4], fill=(56, 189, 248), width=3)
            draw.line([p1[0], y_mid + 4, p2[0], y_mid + 4], fill=(56, 189, 248), width=3)
            draw.line([p1[0] - 6, y_mid - 15, p2[0] + 6, y_mid - 15], fill=(71, 85, 105), width=2)
        else:
            x_mid = p1[0]
            draw.rectangle([x_mid - 12, p1[1], x_mid + 12, p2[1]], fill=(255, 255, 255), outline=(15, 23, 42), width=2)
            draw.line([x_mid - 4, p1[1], x_mid - 4, p2[1]], fill=(56, 189, 248), width=3)
            draw.line([x_mid + 4, p1[1], x_mid + 4, p2[1]], fill=(56, 189, 248), width=3)
            draw.line([x_mid - 15, p1[1] - 6, x_mid - 15, p2[1] + 6], fill=(71, 85, 105), width=2)

    draw_window(1.8, 0.0, 3.2, 0.0, is_horiz=True)    # Kitchen North
    draw_window(4.8, 0.0, 5.6, 0.0, is_horiz=True)    # Bathroom North (Vent)
    draw_window(7.5, 0.0, 8.8, 0.0, is_horiz=True)    # Bed 2 North
    draw_window(0.0, 1.2, 0.0, 2.4, is_horiz=False)   # Kitchen West
    draw_window(0.0, 4.5, 0.0, 5.8, is_horiz=False)   # Dining West
    draw_window(0.0, 7.8, 0.0, 9.8, is_horiz=False)   # Living West
    draw_window(10.0, 1.5, 10.0, 2.8, is_horiz=False) # Bed 2 East
    draw_window(10.0, 6.0, 10.0, 7.5, is_horiz=False) # Master Bed East
    draw_window(1.5, 12.0, 2.8, 12.0, is_horiz=True)  # Living South
    draw_window(7.2, 11.0, 8.8, 11.0, is_horiz=True)  # Master Bed South

    # 6. DOORS
    def draw_door_swing(hinge_m, width_m, start_angle, end_angle, leaf_end_m):
        hx, hy = m2px(hinge_m[0], hinge_m[1])
        radius_px = int(width_m * SCALE)
        bbox = [hx - radius_px, hy - radius_px, hx + radius_px, hy + radius_px]
        draw.arc(bbox, start=start_angle, end=end_angle, fill=(148, 163, 184), width=2)
        lex, ley = m2px(leaf_end_m[0], leaf_end_m[1])
        draw.line([hx, hy, lex, ley], fill=(30, 41, 59), width=4)

    # Main Entrance Double Door
    draw_door_swing((3.5, 12.0), 0.6, 270, 360, (3.5, 11.4))
    draw_door_swing((4.7, 12.0), 0.6, 180, 270, (4.7, 11.4))
    # Kitchen Backdoor
    draw_door_swing((3.5, 0.0), 0.9, 0, 90, (4.4, 0.0))
    # Bathroom Door
    draw_door_swing((4.8, 2.5), 0.85, 270, 360, (4.8, 1.65))
    # Bedroom 2 Door
    draw_door_swing((6.8, 3.5), 0.9, 0, 90, (7.7, 3.5))
    # Master Bedroom Door
    draw_door_swing((6.0, 5.2), 0.9, 0, 90, (6.9, 5.2))

    # 7. ROOM LABELS
    for name, dim, area, lvl, x1, y1, x2, y2, _ in rooms_data:
        if name in ["FOYER", "FRONT TERRACE"]:
            continue
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        if name == "LIVING ROOM":
            cy = 11.0
            cx = 2.4
        elif name == "DINING ROOM":
            cx = 3.6
            cy = 5.4
        elif name == "KITCHEN":
            cx = 2.4
            cy = 2.2
        elif name == "BEDROOM 1 (MASTER)":
            cx = 8.0
            cy = 9.0
        elif name == "BEDROOM 2":
            cx = 8.4
            cy = 2.6
        elif name == "BATHROOM":
            cx = 5.7
            cy = 1.6
        elif name == "HALLWAY":
            cx = 5.25
            cy = 5.2

        c_px, c_py = m2px(cx, cy)
        bw, bh = 240, 84
        draw.rounded_rectangle([c_px - bw//2, c_py - bh//2, c_px + bw//2, c_py + bh//2], radius=12, fill=(255, 255, 255), outline=(203, 213, 225), width=2)
        
        n_bbox = draw.textbbox((0, 0), name, font=f_room_name)
        nw = n_bbox[2] - n_bbox[0]
        draw.text((c_px - nw//2, c_py - 30), name, fill=(15, 23, 42), font=f_room_name)

        sub_text = f"{dim}  •  {area}"
        s_bbox = draw.textbbox((0, 0), sub_text, font=f_room_detail)
        sw = s_bbox[2] - s_bbox[0]
        draw.text((c_px - sw//2, c_py + 6), sub_text, fill=(71, 85, 105), font=f_room_detail)

    # 8. EXTERIOR DIMENSION STRINGS
    DIM_OFFSET_1 = 60
    DIM_OFFSET_2 = 120

    def draw_dim_h(y_px, x1_m, x2_m, text):
        p1 = m2px(x1_m, 0)[0]
        p2 = m2px(x2_m, 0)[0]
        draw.line([p1, y_px, p2, y_px], fill=DIM_LINE_COLOR, width=2)
        draw.line([p1 - 8, y_px + 8, p1 + 8, y_px - 8], fill=DIM_LINE_COLOR, width=2)
        draw.line([p2 - 8, y_px + 8, p2 + 8, y_px - 8], fill=DIM_LINE_COLOR, width=2)
        draw.line([p1, y_px - 15, p1, y_px + 15], fill=DIM_LINE_COLOR, width=1)
        draw.line([p2, y_px - 15, p2, y_px + 15], fill=DIM_LINE_COLOR, width=1)
        tb = draw.textbbox((0, 0), text, font=f_dim)
        tw = tb[2] - tb[0]
        tx = int((p1 + p2) / 2) - tw // 2
        ty = y_px - 26
        draw.rectangle([tx - 4, ty, tx + tw + 4, ty + 22], fill=(255, 255, 255))
        draw.text((tx, ty), text, fill=DIM_TEXT_COLOR, font=f_dim)

    def draw_dim_v(x_px, y1_m, y2_m, text):
        p1 = m2px(0, y1_m)[1]
        p2 = m2px(0, y2_m)[1]
        draw.line([x_px, p1, x_px, p2], fill=DIM_LINE_COLOR, width=2)
        draw.line([x_px - 8, p1 + 8, x_px + 8, p1 - 8], fill=DIM_LINE_COLOR, width=2)
        draw.line([x_px - 8, p2 + 8, x_px + 8, p2 - 8], fill=DIM_LINE_COLOR, width=2)
        draw.line([x_px - 15, p1, x_px + 15, p1], fill=DIM_LINE_COLOR, width=1)
        draw.line([x_px - 15, p2, x_px + 15, p2], fill=DIM_LINE_COLOR, width=1)
        tb = draw.textbbox((0, 0), text, font=f_dim)
        tw = tb[2] - tb[0]
        tx = x_px - tw - 14
        ty = int((p1 + p2) / 2) - 10
        draw.rectangle([tx - 4, ty, tx + tw + 4, ty + 22], fill=(255, 255, 255))
        draw.text((tx, ty), text, fill=DIM_TEXT_COLOR, font=f_dim)

    top_y1 = OY - DIM_OFFSET_1
    top_y2 = OY - DIM_OFFSET_2
    draw_dim_h(top_y1, 0.0, 4.5, "4.50 m")
    draw_dim_h(top_y1, 4.5, 6.8, "2.30 m")
    draw_dim_h(top_y1, 6.8, 10.0, "3.20 m")
    draw_dim_h(top_y2, 0.0, 10.0, "10.00 m (LEBAR BANGUNAN)")

    left_x1 = OX - DIM_OFFSET_1
    left_x2 = OX - DIM_OFFSET_2
    draw_dim_v(left_x1, 0.0, 3.8, "3.80 m")
    draw_dim_v(left_x1, 3.8, 7.0, "3.20 m")
    draw_dim_v(left_x1, 7.0, 12.0, "5.00 m")
    draw_dim_v(left_x2, 0.0, 12.0, "12.00 m (PANJANG BANGUNAN)")

    bot_y1 = OY + int(BLDG_LENGTH_M * SCALE) + DIM_OFFSET_1
    bot_y2 = OY + int(BLDG_LENGTH_M * SCALE) + DIM_OFFSET_2
    draw_dim_h(bot_y1, 0.0, 4.5, "4.50 m")
    draw_dim_h(bot_y1, 4.5, 6.0, "1.50 m")
    draw_dim_h(bot_y1, 6.0, 10.0, "4.00 m")
    draw_dim_h(bot_y2, 0.0, 10.0, "10.00 m TOTAL")

    right_x1 = OX + int(BLDG_WIDTH_M * SCALE) + DIM_OFFSET_1
    right_x2 = OX + int(BLDG_WIDTH_M * SCALE) + DIM_OFFSET_2

    def draw_dim_v_right(x_px, y1_m, y2_m, text):
        p1 = m2px(0, y1_m)[1]
        p2 = m2px(0, y2_m)[1]
        draw.line([x_px, p1, x_px, p2], fill=DIM_LINE_COLOR, width=2)
        draw.line([x_px - 8, p1 + 8, x_px + 8, p1 - 8], fill=DIM_LINE_COLOR, width=2)
        draw.line([x_px - 8, p2 + 8, x_px + 8, p2 - 8], fill=DIM_LINE_COLOR, width=2)
        draw.line([x_px - 15, p1, x_px + 15, p1], fill=DIM_LINE_COLOR, width=1)
        draw.line([x_px - 15, p2, x_px + 15, p2], fill=DIM_LINE_COLOR, width=1)
        tb = draw.textbbox((0, 0), text, font=f_dim)
        tw = tb[2] - tb[0]
        tx = x_px + 14
        ty = int((p1 + p2) / 2) - 10
        draw.rectangle([tx - 4, ty, tx + tw + 4, ty + 22], fill=(255, 255, 255))
        draw.text((tx, ty), text, fill=DIM_TEXT_COLOR, font=f_dim)

    draw_dim_v_right(right_x1, 0.0, 4.8, "4.80 m")
    draw_dim_v_right(right_x1, 4.8, 11.0, "6.20 m")
    draw_dim_v_right(right_x1, 11.0, 12.0, "1.00 m")
    draw_dim_v_right(right_x2, 0.0, 12.0, "12.00 m TOTAL")

    # 9. TITLE BLOCK
    TB_TOP = 2640
    TB_BOT = 2920
    TB_LEFT = 100
    TB_RIGHT = WIDTH - 100

    draw.rectangle([TB_LEFT, TB_TOP, TB_RIGHT, TB_BOT], outline=(15, 23, 42), fill=(255, 255, 255), width=3)
    draw.line([TB_LEFT + 220, TB_TOP, TB_LEFT + 220, TB_BOT], fill=(203, 213, 225), width=2)
    draw.line([TB_RIGHT - 450, TB_TOP, TB_RIGHT - 450, TB_BOT], fill=(203, 213, 225), width=2)

    # Compass
    compass_cx = TB_LEFT + 110
    compass_cy = TB_TOP + 120
    draw.circle((compass_cx, compass_cy), 48, outline=(71, 85, 105), width=2)
    draw.polygon([(compass_cx, compass_cy - 44), (compass_cx - 16, compass_cy + 24), (compass_cx, compass_cy + 12)], fill=(15, 23, 42))
    draw.polygon([(compass_cx, compass_cy - 44), (compass_cx + 16, compass_cy + 24), (compass_cx, compass_cy + 12)], fill=(148, 163, 184))
    draw.text((compass_cx - 8, compass_cy - 75), "N", fill=(15, 23, 42), font=f_room_name)
    draw.text((compass_cx - 24, compass_cy + 54), "UTARA", fill=(71, 85, 105), font=f_block_label)

    # Center Info
    ct_x = TB_LEFT + 250
    draw.text((ct_x, TB_TOP + 25), "SMART HOME 2D STUDIO — SAMPLE ARCHITECTURAL PLAN", fill=(15, 23, 42), font=f_title)
    draw.text((ct_x, TB_TOP + 78), "DENAH RUMAH TINGGAL 1 LANTAI (10.00 × 12.00 METER) — LUAS 120 M²", fill=(71, 85, 105), font=f_sub)

    # Scale Bar
    sb_y = TB_TOP + 155
    draw.text((ct_x, sb_y - 28), "SKALA GRAFIS (GRAPHICAL SCALE):  1 : 50  (170 px = 1.00 m)", fill=(30, 41, 59), font=f_block_val)
    sb_w_m = 170
    for i in range(5):
        bx = ct_x + i * sb_w_m
        fill_col = (15, 23, 42) if i % 2 == 0 else (255, 255, 255)
        draw.rectangle([bx, sb_y, bx + sb_w_m, sb_y + 16], fill=fill_col, outline=(15, 23, 42), width=2)
        draw.text((bx - 4, sb_y + 22), f"{i}m", fill=(71, 85, 105), font=f_block_label)
    draw.text((ct_x + 5 * sb_w_m - 8, sb_y + 22), "5m", fill=(71, 85, 105), font=f_block_label)

    # Right Info
    rm_x = TB_RIGHT - 430
    draw.text((rm_x, TB_TOP + 25), "LEMBAR GAMBAR:", fill=(100, 116, 139), font=f_block_label)
    draw.text((rm_x, TB_TOP + 45), "A-101 (DENAH LT. 1)", fill=(15, 23, 42), font=f_block_val)
    draw.line([TB_RIGHT - 450, TB_TOP + 80, TB_RIGHT, TB_TOP + 80], fill=(226, 232, 240), width=1)

    draw.text((rm_x, TB_TOP + 95), "FORMAT ASSET:", fill=(100, 116, 139), font=f_block_label)
    draw.text((rm_x, TB_TOP + 115), "2500 × 3000 PX (PORTRAIT)", fill=(15, 23, 42), font=f_block_val)
    draw.line([TB_RIGHT - 450, TB_TOP + 150, TB_RIGHT, TB_TOP + 150], fill=(226, 232, 240), width=1)

    draw.text((rm_x, TB_TOP + 165), "TOTAL RUANGAN:", fill=(100, 116, 139), font=f_block_label)
    draw.text((rm_x, TB_TOP + 185), "6 RUANG UTAMA + TERAS", fill=(124, 58, 237), font=f_block_val)
    draw.line([TB_RIGHT - 450, TB_TOP + 220, TB_RIGHT, TB_TOP + 220], fill=(226, 232, 240), width=1)

    draw.text((rm_x, TB_TOP + 235), "TUJUAN PENGUJIAN:", fill=(100, 116, 139), font=f_block_label)
    draw.text((rm_x, TB_TOP + 255), "KALIBRASI & POLIGON 2D", fill=(16, 185, 129), font=f_block_val)

    # Save PNG
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'sample-assets'))
    os.makedirs(out_dir, exist_ok=True)

    png_path = os.path.join(out_dir, 'sample-house-floor-plan.png')
    img.save(png_path, 'PNG', optimize=True)
    print(f"PNG generated successfully: {png_path} ({os.path.getsize(png_path)} bytes)")

if __name__ == '__main__':
    generate_assets()
