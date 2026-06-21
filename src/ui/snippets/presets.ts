/**
 * Default, user-editable source for the tree-sitter code editor — one idiomatic
 * sample per supported language, chosen to exercise a broad span of capture
 * groups (keywords, strings, comments, functions, types, numbers, constants).
 * Each opens with a prominent comment telling the user the code is editable.
 * Users edit these in the preview; edits persist (see store.editorContent) and
 * can be reset back to these defaults.
 */

export const DEFAULT_PRESETS: Record<string, string> = {
  rust: `// EDIT ME — this code is editable; the preview re-highlights as you type.
// Use the "Reset" button (top-right of the preview) to restore this sample.

use std::collections::HashMap;

/// A tinted color scheme.
#[derive(Debug, Clone)]
pub struct Scheme {
    pub name: String,
    pub slots: HashMap<String, u32>,
}

impl Scheme {
    pub fn new(name: &str) -> Self {
        Self { name: name.to_string(), slots: HashMap::new() }
    }

    pub fn set(&mut self, key: &str, hex: u32) -> &mut Self {
        self.slots.insert(key.to_string(), hex);
        self
    }
}

fn main() {
    let mut s = Scheme::new("default-dark");
    s.set("base00", 0x181818).set("base0B", 0xa1b56c);
    println!("{} has {} slots", s.name, s.slots.len());
}
`,
  typescript: `// EDIT ME — this code is editable; the preview re-highlights as you type.
// Use the "Reset" button (top-right of the preview) to restore this sample.

import { readFile } from "node:fs/promises";

/** A 16-slot color scheme. */
export interface Scheme {
  name: string;
  slots: Record<string, string>;
}

const DEFAULT_SLOTS = 16;

export async function load(path: string): Promise<Scheme> {
  const raw = await readFile(path, "utf8");
  const data = JSON.parse(raw) as Scheme;
  if (Object.keys(data.slots).length !== DEFAULT_SLOTS) {
    throw new Error(\`expected \${DEFAULT_SLOTS} slots\`);
  }
  return data;
}

const s = await load("scheme.json");
console.log(\`loaded \${s.name}\`);
`,
  python: `# EDIT ME — this code is editable; the preview re-highlights as you type.
# Use the "Reset" button (top-right of the preview) to restore this sample.

import json
from dataclasses import dataclass, field

MAX_SLOTS = 16


@dataclass
class Scheme:
    """A tinted color scheme."""

    name: str
    slots: dict[str, str] = field(default_factory=dict)

    def set(self, key: str, hex_str: str) -> "Scheme":
        self.slots[key] = hex_str
        return self


def main() -> None:
    s = Scheme("default-dark")
    s.set("base00", "#181818").set("base0B", "#a1b56c")
    print(f"{s.name} has {len(s.slots)} slots")


if __name__ == "__main__":
    main()
`,
  lua: `-- EDIT ME — this code is editable; the preview re-highlights as you type.
-- Use the "Reset" button (top-right of the preview) to restore this sample.

local Scheme = {}
Scheme.__index = Scheme

local MAX_SLOTS = 16

function Scheme.new(name)
  return setmetatable({ name = name, slots = {} }, Scheme)
end

function Scheme:set(key, hex)
  self.slots[key] = hex
  return self
end

local s = Scheme.new("default-dark")
s:set("base00", "#181818"):set("base0B", "#a1b56c")
print(string.format("%s has %d slots", s.name, #vim.tbl_keys(s.slots)))
`,
  go: `// EDIT ME — this code is editable; the preview re-highlights as you type.
// Use the "Reset" button (top-right of the preview) to restore this sample.

package main

import "fmt"

const MaxSlots = 16

// Scheme is a tinted color scheme.
type Scheme struct {
	Name  string
	Slots map[string]uint32
}

func NewScheme(name string) *Scheme {
	return &Scheme{Name: name, Slots: make(map[string]uint32)}
}

func (s *Scheme) Set(key string, hex uint32) *Scheme {
	s.Slots[key] = hex
	return s
}

func main() {
	s := NewScheme("default-dark")
	s.Set("base00", 0x181818).Set("base0B", 0xa1b56c)
	fmt.Printf("%s has %d slots\\n", s.Name, len(s.Slots))
}
`,
  json: `{
  "_comment": "EDIT ME — this JSON is editable; the preview re-highlights as you type. Reset via the button at the top-right of the preview.",
  "scheme": "default-dark",
  "author": "tinted theming",
  "variant": "dark",
  "slots": 16,
  "enabled": true,
  "palette": {
    "base00": "#181818",
    "base05": "#d8d8d8",
    "base08": "#ab4642",
    "base0B": "#a1b56c",
    "base0D": "#7cafc2"
  }
}
`,
  bash: `#!/usr/bin/env bash
# EDIT ME — this code is editable; the preview re-highlights as you type.
# Use the "Reset" button (top-right of the preview) to restore this sample.
set -euo pipefail

SCHEME="\${1:-default-dark}"
SLOTS=16

apply_scheme() {
  local name="$1"
  echo "Applying $name ($SLOTS slots)..."
  for i in $(seq 0 $((SLOTS - 1))); do
    printf 'base%02X ' "$i"
  done
  echo
}

if [[ -n "$SCHEME" ]]; then
  apply_scheme "$SCHEME"
fi
`,
};
