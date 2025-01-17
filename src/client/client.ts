if (process.env.NODE_ENV === 'development') {
	// Must use require here as import statements are only allowed to exist at the top of a file.
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	require("preact/debug");
}
import { h, render } from 'preact';
import styles from './client.module.css';
import { CpuProfileLayout } from './layout';
import { IProfileModel, buildModel, createLenses, GetMemory } from './model';
import { profileShrinkler, Stats } from '../backend/shrinkler';
import { VsCodeApi } from './vscodeApi';
import { ISetCodeLenses, ICpuProfileRaw } from './types';
import { DisplayUnit } from './display';
import { ObjdumpView } from './objdump';
import { SavestateView } from './savestate';
import { GetBlits, GetCopper } from './dma';

// from HTML page
declare const OBJDUMP: string;
declare const PROFILE_URL: string;
declare const SAVESTATE: string;
declare let PROFILES: ICpuProfileRaw[];
declare let MODELS: IProfileModel[];

async function Profiler() {
	document.body.style.overflow = 'hidden';
	const loader = document.createElement('div');
	loader.setAttribute('class', styles.spinner);

	document.body.appendChild(loader);
	let container: HTMLDivElement = null;
	try {
		console.time('fetch+json');
		const response = await fetch(PROFILE_URL);
		PROFILES = await response.json() as ICpuProfileRaw[];
		console.timeEnd('fetch+json');

		if((PROFILES as unknown as Stats).hunks) { // shrinklerstats
			console.log("Shrinkler");
			PROFILES = [ profileShrinkler(PROFILES as unknown as Stats) ];
		}

		console.time('models');

		// build model for first profile
		MODELS.push(buildModel(PROFILES[0]));

		if(PROFILES[0].$amiga) {
			// add dummy models for rest of profiles
			// will be built in layout.tsx as needed, but we need memory to get all copper resources
			for(let i = 1; i < PROFILES.length; i++) {
				const memory = GetMemory(MODELS[i-1].memory, PROFILES[i].$amiga.dmaRecords);
				MODELS.push({ memory } as IProfileModel);
				//MODELS.push(null);
				//MODELS.push(buildModel(PROFILES[i]));
			}
			// build copper, blits for all frames
			for(let i = 0; i < PROFILES.length; i++) {
				MODELS[i].copper = GetCopper(MODELS[i].memory.chipMem, PROFILES[i].$amiga.dmaRecords);
				const customRegs = new Uint16Array(PROFILES[i].$amiga.customRegs);
				MODELS[i].blits = GetBlits(customRegs, PROFILES[i].$amiga.dmaRecords);
			}
		}

		console.timeEnd('models');

		// TODO: set lenses when frame changed in layout.tsx
		if(MODELS[0].amiga) {
			const lenses = createLenses(MODELS[0], DisplayUnit.PercentFrame);
			VsCodeApi.postMessage<ISetCodeLenses>({
				type: 'setCodeLenses',
				lenses
			});
		}

		container = document.createElement('div');
		container.classList.add(styles.wrapper);
		document.body.appendChild(container);
		render(h(CpuProfileLayout, null), container);
	} catch(e) {
		if(container)
			container.remove();
		const error = document.createElement('div');
		error.setAttribute('class', styles.error);
		error.innerText = `Failed to load ${unescape(PROFILE_URL)}:\n${(e as Error).stack}`;
		document.body.appendChild(error);
	} finally {
		document.body.removeChild(loader);
	}
}

function Objdump() {
	document.body.style.paddingRight = '0px';
	const container = document.createElement('div');
	container.classList.add(styles.wrapper);
	document.body.appendChild(container);
	render(h(ObjdumpView, null), container);
}

function Savestate() {
	const container = document.createElement('div');
	container.classList.add(styles.wrapper);
	document.body.appendChild(container);
	render(h(SavestateView, null), container);
}

function TryProfiler() {
	try {
		if(PROFILE_URL) {
			console.log("Profile: " + PROFILE_URL);
			void Profiler();
			return true;
		}
	} catch(e) {}
	return false;
}

function TryObjdump() {
	try {
		if(OBJDUMP) {
			console.log("Objdump");
			void Objdump();
			return true;
		}
	} catch(e) {
		console.log((e as Error).message);
	}
	return false;
}

function TrySavestate() {
	try {
		if(SAVESTATE) {
			console.log("Savestate");
			void Savestate();
			return true;
		}
	} catch(e) {}
	return false;
}

// MAIN ENTRY POINT
console.log("client.tsx START: " + new Date().toLocaleString());

// eslint-disable-next-line no-unused-expressions, @typescript-eslint/no-unused-expressions
TryProfiler() || TryObjdump() || TrySavestate();
