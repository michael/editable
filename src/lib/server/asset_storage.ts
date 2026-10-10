import crypto from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { mkdir, readdir, unlink, rm, stat, utimes } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { mkdirSync } from 'node:fs';
import { mirror_file } from './s3.js';

export type AssetStorageConfig = {
	asset_path: string;
	asset_grace_period_days: number;
	asset_id_regex: RegExp;
};

export function create_asset_storage(config: AssetStorageConfig) {
	const { asset_path: root_path, asset_grace_period_days, asset_id_regex } = config;
	const orphan_grace_period_ms = asset_grace_period_days * 24 * 60 * 60 * 1000;
	mkdirSync(root_path, { recursive: true });

	function asset_path(asset_id: string): string { return join(root_path, asset_id); }
	function stem(asset_id: string): string {
		const ext = extname(asset_id);
		return ext ? asset_id.slice(0, -ext.length) : asset_id;
	}
	function variant_dir(asset_id: string): string { return join(root_path, stem(asset_id)); }
	function variant_path(asset_id: string, width: number): string {
		return join(variant_dir(asset_id), `w${width}.webp`);
	}
	function poster_path(asset_id: string): string {
		return join(variant_dir(asset_id), 'poster.webp');
	}
	async function stream_to_file(file_path: string, data: ReadableStream | Buffer | Uint8Array) {
		let source: Readable;
		if (Buffer.isBuffer(data) || data instanceof Uint8Array) source = Readable.from([data]);
		else source = Readable.fromWeb(data as import('node:stream/web').ReadableStream);
		let bytes_written = 0;
		const hash = crypto.createHash('sha256');
		const counter = new Transform({
			transform(chunk, _encoding, callback) {
				bytes_written += chunk.length;
				hash.update(chunk);
				callback(null, chunk);
			}
		});
		await pipeline(source, counter, createWriteStream(file_path));
		return { bytes_written, sha256: hash.digest('hex') };
	}
	async function write_asset(asset_id: string, data: ReadableStream | Buffer | Uint8Array) {
		const result = await stream_to_file(asset_path(asset_id), data);
		mirror_file(`assets/${asset_id}`, asset_path(asset_id));
		return result;
	}
	async function write_variant(asset_id: string, width: number, data: ReadableStream | Buffer | Uint8Array) {
		const dir = variant_dir(asset_id);
		await mkdir(dir, { recursive: true });
		const result = await stream_to_file(variant_path(asset_id, width), data);
		mirror_file(`assets/${stem(asset_id)}/w${width}.webp`, variant_path(asset_id, width));
		return result;
	}
	async function write_poster(asset_id: string, data: ReadableStream | Buffer | Uint8Array) {
		const dir = variant_dir(asset_id);
		await mkdir(dir, { recursive: true });
		const result = await stream_to_file(poster_path(asset_id), data);
		mirror_file(`assets/${stem(asset_id)}/poster.webp`, poster_path(asset_id));
		return result;
	}
	function asset_exists(asset_id: string): boolean { return existsSync(asset_path(asset_id)); }
	async function delete_asset(asset_id: string): Promise<void> {
		try { await unlink(asset_path(asset_id)); } catch { /* File may not exist. */ }
		const dir = variant_dir(asset_id);
		if (existsSync(dir)) await rm(dir, { recursive: true });
	}
	function create_asset_read_stream(asset_id: string, options: { start?: number; end?: number } = {}): ReadStream {
		return createReadStream(asset_path(asset_id), options);
	}
	function create_variant_read_stream(asset_id: string, width: number, options: { start?: number; end?: number } = {}): ReadStream {
		return createReadStream(variant_path(asset_id, width), options);
	}
	function create_poster_read_stream(asset_id: string): ReadStream { return createReadStream(poster_path(asset_id)); }
	async function asset_size(asset_id: string): Promise<number> { return (await stat(asset_path(asset_id))).size; }
	async function touch_asset(asset_id: string): Promise<void> {
		try { await utimes(asset_path(asset_id), new Date(), new Date()); } catch { /* File may not exist. */ }
	}
	async function delete_orphaned_assets(referenced_asset_ids: Set<string>): Promise<number> {
		const entries = await readdir(root_path, { withFileTypes: true });
		let deleted = 0;
		for (const entry of entries) {
			if (!entry.isFile() || !asset_id_regex.test(entry.name)) continue;
			if (referenced_asset_ids.has(entry.name)) continue;
			const { mtimeMs } = await stat(asset_path(entry.name));
			if (Date.now() - mtimeMs < orphan_grace_period_ms) continue;
			await delete_asset(entry.name);
			deleted++;
		}
		return deleted;
	}
	return {
		write_asset, write_variant, write_poster, asset_exists, delete_asset,
		create_asset_read_stream, create_variant_read_stream, create_poster_read_stream,
		asset_size, touch_asset, delete_orphaned_assets, asset_path, variant_path, poster_path
	};
}
