class ImageCompressor {
    constructor() {
        this.compressionRatio = 0.1; // 压缩到原来的10%
        this.quality = 0.8; // 压缩质量
        this.maxWidth = 1920; // 最大宽度
        this.maxHeight = 1080; // 最大高度
    }

    // 压缩图片
    async compressImage(file, showProgress = false) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = async () => {
                try {
                    // 计算压缩后的尺寸
                    let { width, height } = this.calculateDimensions(img.width, img.height);
                    
                    // 设置canvas尺寸
                    canvas.width = width;
                    canvas.height = height;

                    // 绘制压缩后的图片
                    ctx.drawImage(img, 0, 0, width, height);

                    // 转换为base64
                    const compressedDataURL = canvas.toDataURL('image/jpeg', this.quality);
                    
                    // 计算压缩统计信息
                    const originalSize = file.size;
                    const compressedSize = Math.floor((compressedDataURL.length * 3) / 4); // base64解码后的大小
                    const compressionRatio = compressedSize / originalSize;

                    const result = {
                        compressedDataURL: compressedDataURL,
                        originalSize: originalSize,
                        compressedSize: compressedSize,
                        compressionRatio: compressionRatio,
                        originalWidth: img.width,
                        originalHeight: img.height,
                        compressedWidth: width,
                        compressedHeight: height,
                        format: 'JPEG'
                    };

                    resolve(result);

                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => {
                reject(new Error('图片加载失败'));
            };

            // 创建图片URL并加载
            const imgURL = URL.createObjectURL(file);
            img.src = imgURL;
        });
    }

    // 计算压缩后的尺寸
    calculateDimensions(originalWidth, originalHeight) {
        let { width, height } = { width: originalWidth, height: originalHeight };

        // 如果图片超过最大尺寸，进行缩放
        if (width > this.maxWidth || height > this.maxHeight) {
            const aspectRatio = width / height;
            
            if (width > this.maxWidth) {
                width = this.maxWidth;
                height = width / aspectRatio;
            }
            
            if (height > this.maxHeight) {
                height = this.maxHeight;
                width = height * aspectRatio;
            }
        }

        return {
            width: Math.floor(width),
            height: Math.floor(height)
        };
    }

    // 批量压缩图片
    async compressImages(files, onProgress) {
        const results = [];
        const total = files.length;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
                // 更新进度
                if (onProgress) {
                    onProgress(i, total, `正在压缩第 ${i + 1} 张图片: ${file.name}`);
                }

                const result = await this.compressImage(file);
                results.push({
                    ...result,
                    name: file.name,
                    type: file.type,
                    originalFile: file
                });

            } catch (error) {
                console.error(`压缩图片 ${file.name} 失败:`, error);
                // 压缩失败的图片使用原始文件
                results.push({
                    name: file.name,
                    type: file.type,
                    originalFile: file,
                    compressedDataURL: null,
                    originalSize: file.size,
                    compressedSize: file.size,
                    compressionRatio: 1.0,
                    error: error.message
                });
            }
        }

        return results;
    }

    // 创建预览用的压缩图片（更小的尺寸）
    createPreview(file, maxWidth = 300, maxHeight = 300) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                try {
                    // 计算预览尺寸
                    let { width, height } = this.calculateDimensions(
                        img.width, 
                        img.height, 
                        maxWidth, 
                        maxHeight
                    );

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const previewDataURL = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(previewDataURL);

                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => {
                reject(new Error('预览图片加载失败'));
            };

            const imgURL = URL.createObjectURL(file);
            img.src = imgURL;
        });
    }

    // 临时测试压缩效果的方法
    static async testCompression(file) {
        const compressor = new ImageCompressor();
        const result = await compressor.compressImage(file);
        
        console.log('压缩测试结果:');
        console.log(`原始大小: ${compressor.formatBytes(result.originalSize)}`);
        console.log(`压缩后大小: ${compressor.formatBytes(result.compressedSize)}`);
        console.log(`压缩比例: ${(result.compressionRatio * 100).toFixed(1)}%`);
        console.log(`节省空间: ${compressor.formatBytes(result.originalSize - result.compressedSize)}`);
        
        return result;
    }

    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 获取图片的基本信息
    static getImageInfo(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                resolve({
                    width: img.width,
                    height: img.height,
                    aspectRatio: img.width / img.height,
                    estimatedSize: file.size
                });
                URL.revokeObjectURL(img.src);
            };
            
            img.onerror = () => {
                reject(new Error('无法读取图片信息'));
                URL.revokeObjectURL(img.src);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    // 智能压缩：根据图片类型和大小选择合适的压缩参数
    smartCompress(file) {
        const compressor = new ImageCompressor();
        
        // 根据文件大小调整压缩参数
        if (file.size > 5 * 1024 * 1024) { // 大于5MB
            compressor.quality = 0.7;
            compressor.maxWidth = 1600;
            compressor.maxHeight = 1200;
        } else if (file.size > 2 * 1024 * 1024) { // 大于2MB
            compressor.quality = 0.8;
            compressor.maxWidth = 1920;
            compressor.maxHeight = 1440;
        } else {
            // 小文件使用较高质量
            compressor.quality = 0.85;
            compressor.maxWidth = 2560;
            compressor.maxHeight = 1920;
        }

        // 根据图片类型调整
        if (file.type === 'image/png') {
            compressor.quality -= 0.1; // PNG文件质量可以稍低一些
        }

        return compressor;
    }
}

// 为全局使用添加一些实用函数
window.ImageCompressor = ImageCompressor;

// 压缩测试工具
window.testCompression = (file) => {
    ImageCompressor.testCompression(file).then(result => {
        // 创建测试预览
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 400px;
        `;
        
        container.innerHTML = `
            <h4>压缩测试结果</h4>
            <p><strong>原始:</strong> ${ImageCompressor.prototype.formatBytes.call(compressor, result.originalSize)} (${result.originalWidth}x${result.originalHeight})</p>
            <p><strong>压缩后:</strong> ${ImageCompressor.prototype.formatBytes.call(compressor, result.compressedSize)} (${result.compressedWidth}x${result.compressedHeight})</p>
            <p><strong>压缩比例:</strong> ${(result.compressionRatio * 100).toFixed(1)}%</p>
            <p><strong>节省空间:</strong> ${ImageCompressor.prototype.formatBytes.call(compressor, result.originalSize - result.compressedSize)}</p>
            <button onclick="this.parentElement.remove()">关闭</button>
        `;
        
        document.body.appendChild(container);
    });
};