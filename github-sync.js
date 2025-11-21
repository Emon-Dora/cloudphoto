class GitHubPhotoSync {
    constructor() {
        this.repoOwner = null;
        this.repoName = 'photo-storage-repo'; // 你可以修改这个
        this.token = '';
        this.photosIssueTitle = '照片存储数据';
        this.connected = false;
        
        this.init();
    }

    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadToken();
    }

    initializeElements() {
        this.elements = {
            githubToken: document.getElementById('githubToken'),
            testConnection: document.getElementById('testConnection'),
            connectionStatus: document.getElementById('connectionStatus'),
            syncDownload: document.getElementById('syncDownload'),
            syncUpload: document.getElementById('syncUpload')
        };
    }

    setupEventListeners() {
        this.elements.testConnection.addEventListener('click', () => {
            this.testConnection();
        });

        this.elements.syncDownload.addEventListener('click', () => {
            this.syncFromGitHub();
        });

        this.elements.syncUpload.addEventListener('click', () => {
            this.syncToGitHub();
        });
    }

    // 测试GitHub连接 - 改进版本
    async testConnection() {
        const token = this.elements.githubToken.value.trim();
        if (!token) {
            this.showConnectionStatus(false, '请输入GitHub Token');
            return;
        }

        // 验证Token格式
        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && !token.startsWith('GHSa') && !token.startsWith('EAAa')) {
            this.showConnectionStatus(false, 'Token格式不正确，应以 ghp_、github_pat_、GHSa 或 EAAa 开头');
            return;
        }

        this.showConnectionStatus(false, '正在测试连接...');
        console.log('Starting connection test...');

        try {
            console.log('Testing GitHub connection with token:', token.substring(0, 8) + '...');
            
            // 首先测试基本的用户信息获取
            const user = await this.makeGitHubRequest('/user', token);
            console.log('User data received:', user);
            
            this.token = token;
            this.repoOwner = user.login;
            this.connected = true;
            this.saveToken();
            
            this.showConnectionStatus(true, `已连接用户: ${user.login}`);
            
            // 如果连接成功，检查仓库访问权限
            try {
                await this.ensurePhotoStorageRepo();
                console.log('Repository access verified');
            } catch (repoError) {
                console.warn('Repository access issue:', repoError);
                this.showConnectionStatus(true, `已连接用户: ${user.login} (仓库访问有问题)`);
            }
            
        } catch (error) {
            console.error('Connection test failed:', error);
            this.connected = false;
            
            let errorMessage = '连接失败';
            if (error.message) {
                errorMessage += ': ' + error.message;
            }
            
            this.showConnectionStatus(false, errorMessage);
        }
    }

    // 显示连接状态
    showConnectionStatus(success, message) {
        const status = this.elements.connectionStatus;
        const indicator = status.querySelector('.status-indicator');
        const text = status.querySelector('.status-text');
        
        if (success) {
            status.className = 'connection-status connected';
            indicator.className = 'status-indicator connected';
        } else {
            status.className = 'connection-status disconnected';
            indicator.className = 'status-indicator disconnected';
        }
        
        text.textContent = message;
    }

    // 创建照片存储仓库
    async ensurePhotoStorageRepo() {
        try {
            await this.makeGitHubRequest('/repos/' + this.repoOwner + '/' + this.repoName, this.token);
            // 仓库已存在
        } catch (error) {
            if (error.status === 404) {
                // 仓库不存在，创建新仓库
                try {
                    await this.createRepo();
                } catch (createError) {
                    console.warn('Failed to create repo:', createError);
                }
            }
        }
    }

    // 创建GitHub仓库
    async createRepo() {
        const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: this.repoName,
                description: '照片存储云端仓库',
                private: false
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to create repo: ${response.statusText}`);
        }

        // 创建README文件
        await this.createReadmeFile();
        
        this.showToast('照片存储仓库创建成功！', 'success');
    }

    // 创建README文件 - 修复btoa编码问题
    async createReadmeFile() {
        const readmeContent = '# Photo Storage Cloud Repository\\n\\nThis repository stores user photos.\\n\\n## Usage\\n\\n1. Use GitHub Token for authentication\\n2. Photo data stored via Issues\\n3. Cloud sync and backup supported\\n\\n## Data Structure\\n\\nPhoto data stored in JSON format in GitHub Issues, containing:\\n- Photo ID\\n- Filename\\n- Base64 encoded image data\\n- File size information\\n- Upload time\\n- Compression ratio\\n';
        
        // 使用UTF-8安全的编码方法
        const base64Content = btoa(unescape(encodeURIComponent(readmeContent)));
        
        try {
            const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/README.md`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Add README for photo storage',
                    content: base64Content
                })
            });

            if (!response.ok) {
                console.warn('README creation failed:', response.statusText);
            }
        } catch (error) {
            console.warn('README creation error:', error);
        }
    }

    // 上传到GitHub - 改进版本（安全localStorage操作）
    async syncToGitHub() {
        console.log('Starting upload to GitHub...');
        
        if (!this.connected) {
            this.showToast('请先连接GitHub', 'error');
            return;
        }

        let photos = [];
        try {
            photos = JSON.parse(localStorage.getItem('photoStorage') || '[]');
        } catch (error) {
            this.showToast('无法读取本地照片数据', 'error');
            return;
        }
        
        if (photos.length === 0) {
            this.showToast('没有照片可上传', 'error');
            return;
        }

        // 检查Token权限
        if (!this.token) {
            this.showToast('Token未设置，请重新测试连接', 'error');
            return;
        }

        this.showToast('正在上传到云端...', 'info');
        console.log(`Uploading ${photos.length} photos to GitHub...`);

        try {
            // 验证照片数据
            console.log('Validating photo data...');
            const validPhotos = photos.filter(photo => {
                return photo && photo.id && photo.data && photo.data.length > 0;
            });
            
            if (validPhotos.length !== photos.length) {
                console.warn(`Filtered out ${photos.length - validPhotos.length} invalid photos`);
            }

            // 创建或更新照片存储Issue
            console.log('Creating/updating photos issue...');
            const result = await this.upsertPhotosIssue(validPhotos);
            console.log('Upload successful:', result);
            
            this.showToast(`成功上传 ${validPhotos.length} 张照片到云端`, 'success');
            
            // 更新存储信息显示
            this.updateStorageInfo();
            
            // 保存云端同步时间（如果localStorage可用）
            try {
                localStorage.setItem('lastCloudSync', new Date().toISOString());
            } catch (syncError) {
                console.warn('Failed to save sync time:', syncError);
            }
            
        } catch (error) {
            console.error('Upload to GitHub failed:', error);
            
            // 提供更详细的错误信息
            let errorMessage = '上传失败';
            if (error.message) {
                errorMessage += ': ' + error.message;
            }
            
            // 特定的错误处理
            if (error.status === 401) {
                errorMessage += ' (Token可能已过期，请重新测试连接)';
            } else if (error.status === 403) {
                errorMessage += ' (Token权限不足，需要repo权限)';
            } else if (error.status === 413) {
                errorMessage += ' (照片数据过大，请减少照片数量)';
            } else if (error.message && error.message.includes('422')) {
                errorMessage += ' (数据格式错误，请减少照片数量或重新上传)';
            }
            
            this.showToast(errorMessage, 'error');
        }
    }

    // 从GitHub下载 - 安全版本
    async syncFromGitHub() {
        if (!this.connected) {
            this.showToast('请先连接GitHub', 'error');
            return;
        }

        try {
            const photos = await this.getPhotosFromIssue();
            
            if (!photos || photos.length === 0) {
                this.showToast('云端没有找到照片数据', 'warning');
                return;
            }

            try {
                // 备份当前数据
                const currentPhotos = localStorage.getItem('photoStorage');
                if (currentPhotos) {
                    localStorage.setItem('backup_' + Date.now(), currentPhotos);
                }

                // 导入云端数据
                localStorage.setItem('photoStorage', JSON.stringify(photos));
                console.log('Photos downloaded and saved to localStorage');
            } catch (storageError) {
                console.warn('Failed to save to localStorage:', storageError);
                this.showToast('下载成功，但无法保存到本地（浏览器阻止）', 'warning');
            }
            
            // 刷新主页面照片显示
            if (window.photoStorage) {
                window.photoStorage.photos = photos;
                window.photoStorage.renderPhotos();
            }
            
            this.showToast(`成功从云端下载 ${photos.length} 张照片`, 'success');
            
            // 更新存储信息显示
            this.updateStorageInfo();
            
        } catch (error) {
            console.error('Download from GitHub failed:', error);
            this.showToast('下载失败，请重试', 'error');
        }
    }

    // 创建或更新照片存储Issue - 修复422错误
    async upsertPhotosIssue(photos) {
        console.log('Creating/updating photos issue...');
        
        if (!this.repoOwner || !this.repoName) {
            throw new Error('仓库信息未设置');
        }

        try {
            // 验证和清理照片数据
            const cleanedPhotos = photos.map(photo => {
                // 确保所有字段都是基本数据类型
                return {
                    id: String(photo.id || ''),
                    name: String(photo.name || ''),
                    data: String(photo.data || ''),
                    size: Number(photo.size || 0),
                    originalSize: Number(photo.originalSize || photo.size || 0),
                    compressedSize: Number(photo.compressedSize || photo.size || 0),
                    compressionRatio: Number(photo.compressionRatio || 0),
                    uploadTime: String(photo.uploadTime || new Date().toISOString())
                };
            });

            // 检查数据大小，避免过大导致API错误
            const issueData = {
                title: this.photosIssueTitle,
                body: JSON.stringify({
                    photos: cleanedPhotos,
                    totalCount: cleanedPhotos.length,
                    lastUpdated: new Date().toISOString(),
                    version: '2.1',
                    createdBy: 'Photo Storage App'
                }, null, 2) // 格式化JSON以便调试
            };

            const issueDataSize = JSON.stringify(issueData).length;
            console.log('Issue data size:', issueDataSize, 'bytes');

            // 如果数据过大，返回错误
            if (issueDataSize > 900000) { // GitHub API限制大约1MB
                throw new Error(`数据过大 (${Math.round(issueDataSize/1024)}KB)，请减少照片数量`);
            }

            // 查找现有的照片存储Issue
            console.log('Searching for existing issues...');
            let existingIssues = [];
            try {
                existingIssues = await this.makeGitHubRequest(
                    `/repos/${this.repoOwner}/${this.repoName}/issues?state=all`,
                    this.token
                );
            } catch (searchError) {
                console.warn('Failed to search issues:', searchError);
            }

            let issue;
            const existingIssue = existingIssues.find(i => i.title === this.photosIssueTitle);

            if (existingIssue) {
                // 更新现有Issue
                console.log('Updating existing issue:', existingIssue.number);
                try {
                    const response = await this.makeGitHubRequest(
                        `/repos/${this.repoOwner}/${this.repoName}/issues/${existingIssue.number}`,
                        this.token,
                        'PATCH',
                        issueData
                    );
                    issue = response;
                    console.log('Issue updated successfully');
                } catch (updateError) {
                    console.warn('Failed to update issue, trying to create new one:', updateError);
                    
                    // 如果更新失败，尝试创建新issue
                    const response = await this.makeGitHubRequest(
                        `/repos/${this.repoOwner}/${this.repoName}/issues`,
                        this.token,
                        'POST',
                        issueData
                    );
                    issue = response;
                }
            } else {
                // 创建新Issue
                console.log('Creating new issue...');
                const response = await this.makeGitHubRequest(
                    `/repos/${this.repoOwner}/${this.repoName}/issues`,
                    this.token,
                    'POST',
                    issueData
                );
                issue = response;
                console.log('New issue created:', issue.number);

                // 添加标签（可选，忽略错误）
                try {
                    await this.addLabelToIssue(issue.number);
                    console.log('Label added successfully');
                } catch (labelError) {
                    console.warn('Failed to add label:', labelError);
                }
            }

            return issue;
        } catch (error) {
            console.error('Error in upsertPhotosIssue:', error);
            throw error;
        }
    }

    // 获取照片数据
    async getPhotosFromIssue() {
        const issues = await this.makeGitHubRequest(
            `/repos/${this.repoOwner}/${this.repoName}/issues?state=open&labels=photo-storage`,
            this.token
        );

        const photoStorageIssue = issues.find(i => i.title === this.photosIssueTitle);
        if (!photoStorageIssue) {
            return [];
        }

        try {
            const data = JSON.parse(photoStorageIssue.body);
            return data.photos || [];
        } catch (error) {
            console.error('Failed to parse photo data:', error);
            return [];
        }
    }

    // 为Issue添加标签
    async addLabelToIssue(issueNumber) {
        try {
            await this.makeGitHubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/issues/${issueNumber}/labels`,
                this.token,
                'POST',
                ['photo-storage']
            );
        } catch (error) {
            console.warn('Failed to add label:', error);
        }
    }

    // GitHub API请求 - 改进版本
    async makeGitHubRequest(url, token, method = 'GET', data = null) {
        try {
            console.log(`GitHub API Request: ${method} ${url}`);
            
            const options = {
                method: method,
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Photo-Storage-App'
                }
            };

            if (data && (method === 'POST' || method === 'PATCH')) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`https://api.github.com${url}`, options);
            
            // 读取响应文本以便调试
            const responseText = await response.text();
            console.log('GitHub API Response Status:', response.status);
            console.log('GitHub API Response Text:', responseText);
            
            if (!response.ok) {
                let errorMessage = `GitHub API错误 (${response.status})`;
                
                try {
                    const errorData = JSON.parse(responseText);
                    if (errorData.message) {
                        errorMessage += `: ${errorData.message}`;
                    }
                } catch (e) {
                    // 如果不是JSON格式，使用状态文本
                    errorMessage += `: ${response.statusText}`;
                }
                
                // 添加更多调试信息
                if (response.status === 401) {
                    errorMessage += ' - Token无效或已过期';
                } else if (response.status === 403) {
                    errorMessage += ' - Token权限不足';
                } else if (response.status === 404) {
                    errorMessage += ' - 资源不存在';
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.responseText = responseText;
                throw error;
            }

            // 尝试解析JSON响应
            try {
                return JSON.parse(responseText);
            } catch (e) {
                console.warn('Failed to parse response as JSON:', e);
                return responseText;
            }
            
        } catch (error) {
            console.error('GitHub API Request Error:', error);
            
            // 网络错误处理
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('网络连接失败，请检查网络设置');
            }
            
            throw error;
        }
    }

    // 安全保存Token到localStorage
    saveToken() {
        try {
            if (this.token) {
                localStorage.setItem('github_token', this.token);
                console.log('Token saved to localStorage');
            }
        } catch (error) {
            console.warn('Failed to save token to localStorage:', error);
        }
    }

    // 安全从localStorage加载Token
    loadToken() {
        try {
            const savedToken = localStorage.getItem('github_token');
            if (savedToken && this.elements.githubToken) {
                this.elements.githubToken.value = savedToken;
                console.log('Token loaded from localStorage');
                
                // 自动测试连接
                setTimeout(() => {
                    this.testConnection();
                }, 1000);
            }
        } catch (error) {
            console.warn('Failed to load token from localStorage:', error);
        }
    }

    // 安全更新存储信息显示
    updateStorageInfo() {
        try {
            const localPhotos = JSON.parse(localStorage.getItem('photoStorage') || '[]');
            
            // 尝试获取云端数据（如果存在）
            let cloudPhotos = [];
            try {
                cloudPhotos = JSON.parse(localStorage.getItem('cloud_photos') || '[]');
            } catch (e) {
                cloudPhotos = [];
            }
            
            const localSize = this.calculateTotalSize(localPhotos);
            const cloudSize = this.calculateTotalSize(cloudPhotos);
            
            const storageInfo = document.getElementById('storageInfo');
            if (storageInfo) {
                storageInfo.textContent = `（本地：${this.formatBytes(localSize)} / 云端：${this.formatBytes(cloudSize)}）`;
            }
            
            console.log('Storage info updated:', { localSize, cloudSize });
        } catch (error) {
            console.warn('Failed to update storage info:', error);
        }
    }

    // 计算总大小
    calculateTotalSize(photos) {
        return photos.reduce((total, photo) => total + (photo.compressedSize || photo.size || 0), 0);
    }

    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 显示Toast通知 - 改进版本
    showToast(message, type = 'success') {
        console.log(`Toast (${type}):`, message);
        
        const toast = document.getElementById('toast');
        const toastText = document.getElementById('toastText');
        
        if (toast && toastText) {
            toastText.textContent = message;
            
            // 移除所有之前的类型类
            toast.className = 'toast';
            toast.classList.add(type);
            
            // 添加显示动画
            toast.classList.add('show');
            
            // 根据类型设置不同的显示时间
            let duration = 3000;
            if (type === 'error') {
                duration = 5000; // 错误消息显示更久
            } else if (type === 'info') {
                duration = 2000; // 信息消息较短
            }
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
            
            // 为可访问性添加ARIA属性
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('aria-atomic', 'true');
        } else {
            // 如果toast元素不存在，回退到console.log
            console.log(`Toast (${type}): ${message}`);
            
            // 尝试创建一个简单的警告
            if (type === 'error') {
                alert(`错误: ${message}`);
            }
        }
    }

    // 删除云端照片
    async deleteFromCloud(photoId) {
        if (!this.connected) {
            this.showToast('请先连接GitHub', 'error');
            return;
        }

        try {
            // 获取当前云端照片
            const cloudPhotos = await this.getPhotosFromIssue();
            const filteredPhotos = cloudPhotos.filter(photo => photo.id !== photoId);
            
            // 如果有照片变化，更新云端
            if (filteredPhotos.length !== cloudPhotos.length) {
                await this.upsertPhotosIssue(filteredPhotos);
                this.showToast('云端删除成功', 'success');
            }
            
        } catch (error) {
            console.error('Cloud delete failed:', error);
            this.showToast('云端删除失败', 'error');
        }
    }
}

    // 添加诊断信息功能
    async showDiagnosticInfo() {
        console.log('=== GitHub Sync Diagnostic Info ===');
        console.log('Token exists:', !!this.token);
        console.log('Token format:', this.token ? this.token.substring(0, 10) + '...' : 'none');
        console.log('Connected status:', this.connected);
        console.log('Repo owner:', this.repoOwner);
        console.log('Repo name:', this.repoName);
        console.log('Photos count:', JSON.parse(localStorage.getItem('photoStorage') || '[]').length);
        console.log('LocalStorage photos size:', localStorage.getItem('photoStorage')?.length || 0);
        console.log('=====================================');
        
        this.showToast('诊断信息已输出到控制台 (F12查看)', 'info');
    }

    // 清理本地数据功能
    clearLocalData() {
        localStorage.removeItem('photoStorage');
        localStorage.removeItem('backup_' + Date.now());
        this.showToast('本地数据已清理', 'success');
        
        if (window.photoStorage) {
            window.photoStorage.photos = [];
            window.photoStorage.renderPhotos();
        }
    }
}

// 初始化GitHub同步功能
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing GitHub Sync...');
    
    // 等待DOM完全加载后再初始化
    setTimeout(() => {
        window.githubSync = new GitHubPhotoSync();
        console.log('GitHub Sync initialized');
    }, 100);
});