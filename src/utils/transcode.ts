import { parseBlob as metaParseBlob } from 'music-metadata-browser';

import { DecryptResult } from '@/decrypt/entity';
import { AudioMimeType, GetImageFromURL, WriteMetaToMp3, split_regex } from '@/decrypt/utils';

// 浏览器可解码、支持转换为 mp3 的源格式
export const CONVERTIBLE_EXTS = ['flac', 'ogg', 'm4a', 'wav'];

export function CanConvertToMp3(ext: string): boolean {
  return ext !== 'mp3' && CONVERTIBLE_EXTS.includes(ext);
}

// @ffmpeg/ffmpeg@0.11 的源码使用了 import.meta（webpack4 无法解析），
// 因此不通过 import 引入，而是运行时动态加载其 UMD 构建，从 window.FFmpeg 取用。
interface FFmpegUMD {
  createFFmpeg: (opts: Record<string, unknown>) => any;
  fetchFile: (data: Blob | string | ArrayBuffer | Uint8Array) => Promise<Uint8Array>;
}

// 直接把 Blob 读成 Uint8Array，避免依赖 UMD 版 fetchFile
// （其内部分支在打包后可能误走 fetch(URL) 分支导致 "Failed to fetch"）。
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

const FFMPEG_BASE = (process.env.BASE_URL || './') + 'ffmpeg-core/';

let scriptPromise: Promise<FFmpegUMD> | null = null;

function loadFFmpegUMD(): Promise<FFmpegUMD> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<FFmpegUMD>((resolve, reject) => {
    const w = window as any;
    if (w.FFmpeg) return resolve(w.FFmpeg as FFmpegUMD);
    const script = document.createElement('script');
    script.src = FFMPEG_BASE + 'ffmpeg.min.js';
    script.onload = () => {
      if (w.FFmpeg) resolve(w.FFmpeg as FFmpegUMD);
      else reject(new Error('ffmpeg.min.js 加载后未挂载 window.FFmpeg'));
    };
    script.onerror = () => reject(new Error('加载 ffmpeg.min.js 失败'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let ffmpegInstance: any = null;

// 懒加载单例，避免重复加载 wasm
async function getFFmpeg(): Promise<any> {
  const { createFFmpeg } = await loadFFmpegUMD();
  if (ffmpegInstance) return ffmpegInstance;
  const ff = createFFmpeg({
    log: false,
    corePath: FFMPEG_BASE + 'ffmpeg-core.js',
    workerPath: FFMPEG_BASE + 'ffmpeg-core.worker.js',
    wasmPath: FFMPEG_BASE + 'ffmpeg-core.wasm',
  });
  await ff.load();
  ffmpegInstance = ff;
  return ff;
}

/**
 * 将解密结果中的音频（flac/ogg/m4a/wav）转码为 320k mp3，
 * 并把标题/歌手/专辑/封面写入 ID3 标签，返回一个新的 DecryptResult。
 */
export async function transcodeToMp3(data: DecryptResult): Promise<DecryptResult> {
  const ffmpeg = await getFFmpeg();

  const inputName = `input_${Date.now()}.${data.ext}`;
  const outputName = `output_${Date.now()}.mp3`;

  let mp3Data: Uint8Array;
  try {
    ffmpeg.FS('writeFile', inputName, await blobToUint8Array(data.blob));
    await ffmpeg.run('-i', inputName, '-vn', '-b:a', '320k', outputName);
    mp3Data = ffmpeg.FS('readFile', outputName);
  } finally {
    // 清理内存文件，避免多次转码后堆积
    try {
      ffmpeg.FS('unlink', inputName);
    } catch (e) {
      /* ignore */
    }
    try {
      ffmpeg.FS('unlink', outputName);
    } catch (e) {
      /* ignore */
    }
  }

  // 写入 ID3 元数据（复用原始 title/artist/album/picture）
  let finalBuffer: Uint8Array | Buffer = mp3Data;
  try {
    const original = await metaParseBlob(new Blob([mp3Data], { type: AudioMimeType.mp3 }));
    let picture: ArrayBuffer | undefined;
    if (data.picture) {
      const img = await GetImageFromURL(data.picture);
      if (img) picture = img.buffer;
    }
    finalBuffer = WriteMetaToMp3(
      Buffer.from(mp3Data),
      {
        title: data.title,
        artists: data.artist ? data.artist.split(split_regex) : [],
        album: data.album,
        picture,
      },
      original,
    );
  } catch (e) {
    console.warn('写入 mp3 元数据失败，输出无标签 mp3', e);
    finalBuffer = mp3Data;
  }

  const blob = new Blob([finalBuffer], { type: AudioMimeType.mp3 });

  // 封面复用：单独新建一个 objectURL，避免与原行共享导致 revoke 冲突
  let picture: string | undefined;
  if (data.picture) {
    try {
      const img = await GetImageFromURL(data.picture);
      if (img) picture = img.url;
    } catch (e) {
      /* ignore */
    }
  }

  return {
    title: data.title,
    artist: data.artist,
    album: data.album,
    ext: 'mp3',
    mime: AudioMimeType.mp3,
    blob,
    file: URL.createObjectURL(blob),
    picture,
    rawFilename: data.rawFilename,
    rawExt: data.rawExt,
  };
}
