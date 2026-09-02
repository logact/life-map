## Code discovery

If `.codegraph/` exists, use CodeGraph before text search when locating or understanding code.

## Architecture

Life Map is layered inward: `ui -> application -> domain`, with `infrastructure` implementing domain ports.

- Put entities, topology, invariants, and repository interfaces in `src/domain/lifeMap/**`.
- Put use cases, projection, layout, display policy, and render-ready read models in `src/application/**`.
- Put repository and runtime adapters in `src/infrastructure/**`.
- UI may consume application services and read models. It must not traverse repositories or canonical snapshots.
- `src/ui/composition/**` is the only UI location allowed to instantiate infrastructure adapters.
- Work inward first: update domain behavior, then application behavior, then UI behavior.
- Keep execution plans in `docs/exec-plans/**` and implementation reports in `docs/cycles/**`.

Run `npm run check` before handing off changes. It includes TypeScript, dependency-cruiser, and Jest.
