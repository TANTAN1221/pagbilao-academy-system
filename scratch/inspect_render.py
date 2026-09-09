with open('student-dashboard.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('scratch/view_js_around_render.txt', 'w', encoding='utf-8') as out:
    for i in range(1240, 1515):
        if i < len(lines):
            out.write(f"{i+1}: {lines[i]}")
