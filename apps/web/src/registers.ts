const hex = (n: number, digits = 2) => n.toString(16).toUpperCase().padStart(digits, '0');

const GROUPS = [
  { label: 'Pulse 1', addresses: [0x4000, 0x4001, 0x4002, 0x4003] },
  { label: 'Pulse 2', addresses: [0x4004, 0x4005, 0x4006, 0x4007] },
  { label: 'Triangle', addresses: [0x4008, 0x400a, 0x400b] },
  { label: 'Noise', addresses: [0x400c, 0x400e, 0x400f] },
  { label: 'DMC', addresses: [0x4010, 0x4011, 0x4012, 0x4013] },
  { label: 'Contrôle', addresses: [0x4015, 0x4017] },
];

const DUTIES = ['12,5 %', '25 %', '50 %', '75 %'];

/** Human-readable meaning of a channel's registers. */
function describe(label: string, r: Uint8Array): string {
  const at = (address: number) => r[address - 0x4000];
  switch (label) {
    case 'Pulse 1':
    case 'Pulse 2': {
      const base = label === 'Pulse 1' ? 0x4000 : 0x4004;
      const period = at(base + 2) | ((at(base + 3) & 7) << 8);
      const sweep =
        at(base + 1) & 0x80 ? ` · sweep ${at(base + 1) & 0x08 ? '↑' : '↓'}${at(base + 1) & 7}` : '';
      return `duty ${DUTIES[at(base) >> 6]} · vol ${at(base) & 15} · période ${period}${sweep}`;
    }
    case 'Triangle': {
      const period = at(0x400a) | ((at(0x400b) & 7) << 8);
      return `${at(0x4008) & 0x7f ? 'actif' : 'muet'} · période ${period}`;
    }
    case 'Noise':
      return `vol ${at(0x400c) & 15} · période ${at(0x400e) & 15} · ${at(0x400e) & 0x80 ? 'métallique' : 'normal'}`;
    case 'DMC':
      return `vitesse ${at(0x4010) & 15} · adresse $${hex(0xc000 + at(0x4012) * 64, 4)} · ${at(0x4013) * 16 + 1} octets`;
    default:
      return `canaux actifs ${hex(at(0x4015) & 0x1f)}`;
  }
}

/** Live view of the APU registers $4000-$4017, with the bytes written in the last frame lit up. */
export class RegisterView {
  private cells = new Map<number, HTMLElement>();
  private descriptions: HTMLElement[] = [];
  private lit = new Map<number, number>();

  constructor(parent: HTMLElement) {
    const table = document.createElement('div');
    table.className = 'registers';
    for (const group of GROUPS) {
      const row = document.createElement('div');
      row.className = 'register-row';
      const name = document.createElement('span');
      name.className = 'register-name';
      name.textContent = group.label;
      const bytes = document.createElement('span');
      bytes.className = 'register-bytes';
      for (const address of group.addresses) {
        const cell = document.createElement('span');
        cell.title = `$${hex(address, 4)}`;
        cell.textContent = '00';
        this.cells.set(address, cell);
        bytes.append(cell);
      }
      const description = document.createElement('span');
      description.className = 'register-description';
      this.descriptions.push(description);
      row.append(name, bytes, description);
      table.append(row);
    }
    parent.append(table);
  }

  update(registers: Uint8Array, written: readonly { address: number }[]): void {
    for (const { address } of written) this.lit.set(address, 6);
    for (const [address, cell] of this.cells) {
      const text = hex(registers[address - 0x4000]);
      if (cell.textContent !== text) cell.textContent = text;
      const frames = this.lit.get(address) ?? 0;
      cell.classList.toggle('written', frames > 0);
      if (frames > 0) this.lit.set(address, frames - 1);
    }
    GROUPS.forEach((group, i) => {
      const text = describe(group.label, registers);
      if (this.descriptions[i].textContent !== text) this.descriptions[i].textContent = text;
    });
  }
}
