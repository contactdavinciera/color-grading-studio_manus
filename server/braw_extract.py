#!/usr/bin/env python3
"""
BRAW Frame Extractor - Based on official pybraw example
Extracts frames and metadata from Blackmagic RAW files
"""

import sys
import json
import argparse
from pathlib import Path
from PIL import Image
from pybraw import _pybraw

class BRAWCallback(_pybraw.BlackmagicRawCallback):
    """Callback for BRAW frame processing"""
    
    def __init__(self):
        super().__init__()
        self.processed_image = None
        self.error = None
    
    def ReadComplete(self, job, result, frame):
        """Called when frame read is complete"""
        try:
            # Set output format to RGBA U8
            status, _ = frame.SetResourceFormat(_pybraw.blackmagicRawResourceFormatRGBAU8)
            if status != 0:
                self.error = f"SetResourceFormat failed: {status}"
                return
            
            # Create decode and process job
            status, process_job = frame.CreateJobDecodeAndProcessFrame()
            if status != 0:
                self.error = f"CreateJobDecodeAndProcessFrame failed: {status}"
                return
            
            # Submit the job
            status = process_job.Submit()
            if status != 0:
                self.error = f"Submit failed: {status}"
            
            process_job.Release()
            
        except Exception as e:
            self.error = f"ReadComplete exception: {str(e)}"
    
    def ProcessComplete(self, job, result, processed_image):
        """Called when frame processing is complete"""
        self.processed_image = processed_image


def get_metadata(braw_path):
    """Extract metadata from BRAW file"""
    try:
        # Create factory and codec
        factory = _pybraw.CreateBlackmagicRawFactoryInstance()
        status, codec = factory.CreateCodec()
        if status != 0:
            return {'error': f'CreateCodec failed: {status}'}
        
        # Open clip
        status, clip = codec.OpenClip(str(braw_path))
        if status != 0:
            codec.Release()
            return {'error': f'OpenClip failed: {status}'}
        
        # Get clip properties
        status, frame_count = clip.GetFrameCount()
        if status != 0:
            clip.Release()
            codec.Release()
            return {'error': f'GetFrameCount failed: {status}'}
        
        status, width = clip.GetWidth()
        if status != 0:
            width = 0
        
        status, height = clip.GetHeight()
        if status != 0:
            height = 0
        
        status, frame_rate = clip.GetFrameRate()
        if status != 0:
            frame_rate = 0.0
        
        metadata = {
            'success': True,
            'frame_count': frame_count,
            'width': width,
            'height': height,
            'frame_rate': frame_rate,
            'duration': frame_count / frame_rate if frame_rate > 0 else 0,
        }
        
        # Cleanup
        clip.Release()
        codec.Release()
        
        return metadata
        
    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'traceback': traceback.format_exc()
        }


def extract_frame(braw_path, frame_index=0, output_path=None):
    """Extract a single frame from BRAW file"""
    
    callback = None
    codec = None
    clip = None
    
    try:
        # Create factory and codec
        factory = _pybraw.CreateBlackmagicRawFactoryInstance()
        status, codec = factory.CreateCodec()
        if status != 0:
            return {'error': f'CreateCodec failed: {status}'}
        
        # Open clip
        status, clip = codec.OpenClip(str(braw_path))
        if status != 0:
            return {'error': f'OpenClip failed: {status}'}
        
        # Verify frame index
        status, frame_count = clip.GetFrameCount()
        if status != 0:
            return {'error': f'GetFrameCount failed: {status}'}
        
        if frame_index < 0 or frame_index >= frame_count:
            return {'error': f'Frame {frame_index} out of range (0-{frame_count-1})'}
        
        # Create and set callback - MUST be done before creating read job
        callback = BRAWCallback()
        status = codec.SetCallback(callback)
        if status != 0:
            return {'error': f'SetCallback failed: {hex(status & 0xFFFFFFFF)}'}
        
        # Create read job
        status, read_job = clip.CreateJobReadFrame(frame_index)
        if status != 0:
            return {'error': f'CreateJobReadFrame failed: {status}'}
        
        if not read_job:
            return {'error': 'CreateJobReadFrame returned null job'}
        
        # Submit job
        status = read_job.Submit()
        if status != 0:
            read_job.Release()
            return {'error': f'Job submit failed: {status}'}
        
        read_job.Release()
        
        # Wait for processing to complete
        status = codec.FlushJobs()
        if status != 0:
            return {'error': f'FlushJobs failed: {status}'}
        
        # Check for callback errors
        if callback.error:
            return {'error': callback.error}
        
        # Check if we got the processed image
        if not callback.processed_image:
            return {'error': 'No processed image received from callback'}
        
        # Get resource type
        status, resource_type = callback.processed_image.GetResourceType()
        if status != 0:
            return {'error': f'GetResourceType failed: {status}'}
        
        if resource_type != _pybraw.blackmagicRawResourceTypeBufferCPU:
            return {'error': f'Unexpected resource type: {resource_type}'}
        
        # Convert to numpy array
        np_image = callback.processed_image.to_py()
        
        # Clean up processed image
        del callback.processed_image
        
        # Convert RGBA to RGB (remove alpha channel)
        if len(np_image.shape) == 3 and np_image.shape[2] == 4:
            np_image = np_image[..., :3]
        
        # Create PIL image
        pil_image = Image.fromarray(np_image)
        
        # Save if output path provided
        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            pil_image.save(str(output_path), 'JPEG', quality=95)
            
            result = {
                'success': True,
                'path': str(output_path),
                'width': np_image.shape[1],
                'height': np_image.shape[0]
            }
        else:
            result = {
                'success': True,
                'width': np_image.shape[1],
                'height': np_image.shape[0]
            }
        
        return result
        
    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
    
    finally:
        # Cleanup
        if clip:
            clip.Release()
        if codec:
            codec.Release()


def main():
    parser = argparse.ArgumentParser(description='Extract frames from BRAW files')
    parser.add_argument('command', choices=['metadata', 'extract'], help='Command to execute')
    parser.add_argument('input', help='Input BRAW file path')
    parser.add_argument('--frame', type=int, default=0, help='Frame index to extract (for extract command)')
    parser.add_argument('--output', help='Output image file path (for extract command)')
    
    args = parser.parse_args()
    
    if args.command == 'metadata':
        result = get_metadata(args.input)
    elif args.command == 'extract':
        result = extract_frame(args.input, args.frame, args.output)
    else:
        result = {'error': f'Unknown command: {args.command}'}
    
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()

