/**
 * The contracts panel (CLAUDE.md §2, step 7; ETH-024): which contracts the run takes on, one per
 * contract slot.
 */
import { ContractsPanel } from '../components/ContractsPanel';
import { definePreparePanel } from '../types';

export default definePreparePanel({ id: 'contracts', title: 'Contracts', column: 'risk', order: 20, Component: ContractsPanel });
