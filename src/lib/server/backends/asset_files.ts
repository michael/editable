import crypto from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { mkdir, readdir, rm, stat, unlink, utimes } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mirror_file } from '../s3.js';
import type { AssetData, Backend } from '../backend.js';

type AssetFunctions = Pick<
	Backend,
	'write_asset' | 'read_asset' | 'asset_size' | 'delete_asset' | 'touch_asset' | 'list_assets'
>;

/**
 * Asset files in a folder: each original under its id, its variants in a
 * folder named after it. Writes are mirrored to S3 when configured.
 */
export function asset_files(dir: string): AssetFunctions {
	mkdirSync(dir, { recursive: true });

	const stem = (asset_id: string) => asset_id.slice(0, -extname(asset_id).length || undefined);
	function path_of(asset_id: string, variant?: string) {
		if (/[/\\]|^\.+$/.test(asset_id) || (variant && !/^[\w-]+\.\w+$/.test(variant)))
			throw new Error(`Invalid asset file: ${asset_id} ${variant ?? ''}`);
		return variant ? join(dir, stem(asset_id), variant) : join(dir, asset_id);
	}

	async function write_file(path: string, data: AssetData) {
		const source =
			data instanceof Uint8Array
				? Readable.from([data])
				: Readable.fromWeb(data as import('node:stream/web').ReadableStream);
		let bytes_written = 0;
		const hash = crypto.createHash('sha256');
		const counter = new Transform({
			transform(chunk, _encoding, callback) {
				bytes_written += chunk.length;
				hash.update(chunk);
				callback(null, chunk);
			}
		});
		await mkdir(dirname(path), { recursive: true });
		await pipeline(source, counter, createWriteStream(path));
		return { bytes_written, sha256: hash.digest('hex') };
	}

	const size = async (path: string) => (await stat(path).catch(() => null))?.size ?? null;

	return {
		async write_asset(asset_id, data, variant) {
			const path = path_of(asset_id, variant);
			const result = await write_file(path, data);
			mirror_file(`assets/${variant ? `${stem(asset_id)}/${variant}` : asset_id}`, path);
			return result;
		},
		async read_asset(asset_id, { variant, range } = {}) {
			const path = path_of(asset_id, variant);
			if ((await size(path)) === null) return null;
			return Readable.toWeb(createReadStream(path, range)) as ReadableStream<Uint8Array>;
		},
		asset_size: (asset_id, variant) => size(path_of(asset_id, variant)),
		async delete_asset(asset_id, variant) {
			await unlink(path_of(asset_id, variant)).catch(() => {});
			if (!variant) await rm(join(dir, stem(asset_id)), { recursive: true, force: true });
		},
		async touch_asset(asset_id) {
			const now = new Date();
			await utimes(path_of(asset_id), now, now).catch(() => {});
		},
		async list_assets() {
			const entries = await readdir(dir, { withFileTypes: true });
			const files = entries.filter((entry) => entry.isFile());
			return Promise.all(
				files.map(async (entry) => ({
					asset_id: entry.name,
					last_used: (await stat(join(dir, entry.name))).mtimeMs
				}))
			);
		}
	};
}
