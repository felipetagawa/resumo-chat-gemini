import re
import os

file_path = 'content.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find conflict blocks and keep the REMOTE part (after =======)
# Matches: <<<<<<< HEAD ... ======= (captured content) >>>>>>> ...
pattern = r'<<<<<<< HEAD[\s\S]*?=======([\s\S]*?)>>>>>>> [^\n]*'

# Function to extract the captured group (remote content)
def replacer(match):
    return match.group(1)

new_content = re.sub(pattern, replacer, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Resolving conflicts in {file_path} complete.")
