# Mantine over shadcn/ui

Loom uses Mantine for components and theming. It ships nearly everything Loom needs, including notifications, forms, and dates, and the author already uses it at work. Swapping UI libraries later touches every screen, and the project's learning budget is going to TanStack Start instead.

## Considered Options

- **shadcn/ui (Radix + Tailwind)**: popular, and you own the components. Rejected for now because it means learning Tailwind, Radix, and shadcn's conventions alongside a new framework, and building more pieces by hand.
