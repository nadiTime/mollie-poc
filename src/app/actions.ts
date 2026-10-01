'use server';

import { revalidatePath } from 'next/cache';
import { setTestmode } from '@/lib/store';

/** The app-wide test/live switch in the nav. Re-renders every page in the new mode. */
export async function setMode(testmode: boolean) {
  await setTestmode(testmode);
  revalidatePath('/', 'layout');
}
