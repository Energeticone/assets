"""Skills: reusable expertise packages the agents load on demand.

A skill lives under `<workspace>/.superman/skills/<name>/`:

    security-review/
    ├── SKILL.md      - instructions, rules, examples
    ├── scripts/      - automated checks (runnable via run_command)
    └── references/   - e.g. OWASP rules, security patterns

The Engineering Lead selects which skills a run needs; their content is
injected into the working agents' context.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

SKILLS_DIR = "skills"
MAX_REFERENCE_CHARS = 8_000
MAX_SKILL_CHARS = 12_000

SKILL_TEMPLATE = """\
# {name}

One-line description of when this skill applies.

## Instructions

- Rule or step the agents must follow when this skill is active.

## Examples

- Show what good output looks like.
"""


@dataclass
class Skill:
    name: str
    path: Path
    body: str
    scripts: list[str] = field(default_factory=list)
    references: dict[str, str] = field(default_factory=dict)

    @property
    def description(self) -> str:
        for line in self.body.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                return stripped
        return "(no description)"

    def render(self) -> str:
        parts = [f"### Skill: {self.name}\n{self.body.strip()}"]
        if self.scripts:
            parts.append(
                "Automated checks (run with run_command):\n"
                + "\n".join(f"- python {s}" for s in self.scripts)
            )
        for ref_name, content in self.references.items():
            parts.append(f"Reference {ref_name}:\n{content}")
        text = "\n\n".join(parts)
        if len(text) > MAX_SKILL_CHARS:
            text = text[:MAX_SKILL_CHARS] + "\n... (skill truncated)"
        return text


def discover(state_dir: Path) -> list[Skill]:
    root = state_dir / SKILLS_DIR
    if not root.is_dir():
        return []
    skills = []
    for skill_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        manifest = skill_dir / "SKILL.md"
        if not manifest.is_file():
            continue
        scripts = sorted(
            str(p.relative_to(state_dir.parent))
            for p in (skill_dir / "scripts").glob("*")
            if p.is_file()
        )
        references = {}
        for ref in sorted((skill_dir / "references").glob("*")):
            if ref.is_file():
                content = ref.read_text(encoding="utf-8", errors="replace")
                if len(content) > MAX_REFERENCE_CHARS:
                    content = content[:MAX_REFERENCE_CHARS] + "\n... (truncated)"
                references[ref.name] = content
        skills.append(
            Skill(
                name=skill_dir.name,
                path=skill_dir,
                body=manifest.read_text(encoding="utf-8", errors="replace"),
                scripts=scripts,
                references=references,
            )
        )
    return skills


def scaffold(state_dir: Path, name: str) -> Path:
    skill_dir = state_dir / SKILLS_DIR / name
    if skill_dir.exists():
        raise FileExistsError(f"skill already exists: {skill_dir}")
    (skill_dir / "scripts").mkdir(parents=True)
    (skill_dir / "references").mkdir()
    (skill_dir / "SKILL.md").write_text(SKILL_TEMPLATE.format(name=name), encoding="utf-8")
    return skill_dir


def catalog(skills: list[Skill]) -> str:
    if not skills:
        return "(no skills installed)"
    return "\n".join(f"- {s.name}: {s.description}" for s in skills)
