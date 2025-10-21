#!/usr/bin/env python3
"""
BRAW Decoder using pybraw low-level API
Extracts frames from Blackmagic RAW files
"""

import sys
import json
from pathlib import Path
import numpy as np
from PIL import Image
from pybraw import _pybraw

class FrameCallback(_pybraw.BlackmagicRawCallback):
    """Callback for frame processing"""
    def __init__(self):
        super().__init__()
        self.processed_image = None
        
    def ReadComplete(self, job, result, frame):
        status, _ = frame.SetResourceFormat(_pybraw.blackmagicRawResourceFormatRGBU8)
        if status != 0:
            print(f"Warning: SetResourceFormat returned status {status}", file=sys.stderr)
        
        status, process_job = frame.CreateJobDecodeAndProcessFrame()
        if status != 0:
            print(f"Error: CreateJobDecodeAndProcessFrame returned status {status}", file=sys.stderr)
            return
        
        status = process_job.Submit()
        if status != 0:
            print(f"Warning: Submit returned status {status}", file=sys.stderr)
        
        process_job.Release()

    def ProcessComplete(self, job, result, processed_image):
        self.processed_image = processed_image

def get_metadata(braw_path):
    """Extract metadata from BRAW file"""
    try:
        factory = _pybraw.CreateBlackmagicRawFactoryInstance()
        status, codec = factory.CreateCodec()
        if status != 0:
            return {'error': f'CreateCodec failed with status {status}'}
        
        status, clip = codec.OpenClip(braw_path)
        if status != 0:
            return {'error': f'OpenClip failed with status {status}'}
        
        status, frame_count = clip.GetFrameCount()
        if status != 0:
            return {'error': f'GetFrameCount failed with status {status}'}
        
        status, width = clip.GetWidth()
        if status != 0:
            return {'error': f'GetWidth failed with status {status}'}
        
        status, height = clip.GetHeight()
        if status != 0:
            return {'error': f'GetHeight failed with status {status}'}
        
        status, frame_rate = clip.GetFrameRate()
        if status != 0:
            return {'error': f'GetFrameRate failed with status {status}'}
        
        metadata = {
            'frame_count': frame_count,
            'width': width,
            'height': height,
            'frame_rate': frame_rate,
            'duration': frame_count / frame_rate if frame_rate > 0 else 0,
        }
        
        clip.Release()
        codec.Release()
        
        return metadata
    except Exception as e:
        import traceback
        return {'error': str(e), 'traceback': traceback.format_exc()}

def extract_frame(braw_path, frame_index=0, output_path=None):
    """Extract a single frame from BRAW file"""
    try:
        factory = _pybraw.CreateBlackmagicRawFactoryInstance()
        status, codec = factory.CreateCodec()
        if status != 0:
            return {'error': f'CreateCodec failed with status {status}'}
        
        status, clip = codec.OpenClip(braw_path)
        if status != 0:
            return {'error': f'OpenClip failed with status {status}'}
        
        status, frame_count = clip.GetFrameCount()
        if status != 0:
            return {'error': f'GetFrameCount failed with status {status}'}
        
        if frame_index < 0 or frame_index >= frame_count:
            return {'error': f'Frame {frame_index} out of range (0-{frame_count-1})'}
        
        callback = FrameCallback()
        status = codec.SetCallback(callback)
        if status != 0:
            return {'error': f'SetCallback failed with status {status}'}
        
        status, read_job = clip.CreateJobReadFrame(frame_index)
        if status != 0:
            return {'error': f'CreateJobReadFrame failed with status {status}'}
        
        status = read_job.Submit()
        if status != 0:
            return {'error': f'Submit failed with status {status}'}
        
        read_job.Release()
        
        status = codec.FlushJobs()
        if status != 0:
            return {'error': f'FlushJobs failed with status {status}'}
        
        if callback.processed_image is None:
            return {'error': 'Failed to process frame - no image received in callback'}
        
        status, resource_type = callback.processed_image.GetResourceType()
        if status != 0:
            return {'error': f'GetResourceType failed with status {status}'}
        
        if resource_type != _pybraw.blackmagicRawResourceTypeBufferCPU:
            return {'error': f'Unexpected resource type: {resource_type}'}
        
        np_image = callback.processed_image.to_py()
        del callback.processed_image
        
        # Convert to RGB (remove alpha channel if present)
        if np_image.shape[2] == 4:
            np_image = np_image[..., :3]
        
        pil_image = Image.fromarray(np_image)
        
        if output_path:
            pil_image.save(output_path, 'JPEG', quality=95)
            result = {'success': True, 'path': output_path, 'width': np_image.shape[1], 'height': np_image.shape[0]}
        else:
            result = {'success': True, 'width': np_image.shape[1], 'height': np_image.shape[0]}
        
        clip.Release()
        codec.Release()
        
        return result
        
    except Exception as e:
        import traceback
        return {'error': str(e), 'traceback': traceback.format_exc()}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Usage: braw_decoder.py <command> <braw_path> [args...]'}))
        sys.exit(1)
    
    command = sys.argv[1]
    braw_path = sys.argv[2]
    
    if command == 'metadata':
        result = get_metadata(braw_path)
        print(json.dumps(result))
        
    elif command == 'extract_frame':
        frame_index = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        output_path = sys.argv[4] if len(sys.argv) > 4 else None
        
        result = extract_frame(braw_path, frame_index, output_path)
        print(json.dumps(result))
        
    else:
        print(json.dumps({'error': f'Unknown command: {command}'}))
        sys.exit(1)

if __name__ == '__main__':
    main()

