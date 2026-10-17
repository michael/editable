import type { Readable } from 'node:stream';

export type AssetData = ReadableStream | Buffer | Uint8Array;
export type AssetWritten = { bytes_written: number; sha256: string };
export type ByteRange = { start?: number; end?: number };

/**
 * A site's asset files: originals by content-addressed id, and the image
 * variants and video posters made from them. Asset cleanup deletes originals
 * that no record references once their grace period has passed.
 */
export type Assets = {
	write_asset(asset_id: string, data: AssetData): Promise<AssetWritten>;
	write_variant(asset_id: string, width: number, data: AssetData): Promise<AssetWritten>;
	write_poster(asset_id: string, data: AssetData): Promise<AssetWritten>;
	asset_exists(asset_id: string): boolean;
	asset_size(asset_id: string): Promise<number>;
	create_asset_read_stream(asset_id: string, range?: ByteRange): Readable;
	create_variant_read_stream(asset_id: string, width: number, range?: ByteRange): Readable;
	create_poster_read_stream(asset_id: string): Readable;
	/** Mark an asset as used now, restarting its grace period. */
	touch_asset(asset_id: string): Promise<void>;
	/** Delete an original with its variants and poster. */
	delete_asset(asset_id: string): Promise<void>;
	/** Delete unreferenced originals past their grace period; returns how many. */
	delete_orphaned_assets(referenced_asset_ids: Set<string>): Promise<number>;
	// Where the files are on disk. Only a backend that keeps files has paths,
	// so code that uses them works with that backend alone.
	asset_path(asset_id: string): string;
	variant_path(asset_id: string, width: number): string;
	poster_path(asset_id: string): string;
};
