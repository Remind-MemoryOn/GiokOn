import { getDuplexModule } from '../../../modules/giokon-duplex';
import { createDuplexAdapter } from './duplex-adapter';
export const duplexAudio = createDuplexAdapter(getDuplexModule);
