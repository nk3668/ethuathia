import { templatesMet } from '../../sim';
import { useDiscovered } from './useDiscovered';

/** The monster templates met on one kind of monster so far (ETH-117), by name; each has its own Codex entry. */
export function VariantsMet({ monster }: { monster: string }) {
  const met = templatesMet(useDiscovered(), monster);
  return <>{met.length === 0 ? 'None yet' : met.map((t) => t.name).join(', ')}</>;
}
