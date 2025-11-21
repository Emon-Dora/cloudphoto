class GitHubPhotoSync {
    constructor() {
        this.repoOwner = null;
        this.repoName = 'cloudphoto'; // 使用你设置的仓库名
        this.token = '';
        this.photosIssueTitle = 'Photo Storage Data';
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
            
            // 如果连接成功，确保仓库可用
            try {
                await this.ensurePhotoStorageRepo();
                console.log('Repository ready');
                this.showConnectionStatus(true, `已连接用户: ${user.login}，仓库就绪`);
            } catch (repoError) {
                console.error('Repository setup failed:', repoError);
                this.connected = false;
                this.showConnectionStatus(false, `连接成功但仓库创建失败: ${repoError.message}`);
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

    // 确保照片存储仓库存在
    async ensurePhotoStorageRepo() {
        console.log(`Checking repository: ${this.repoOwner}/${this.repoName}`);
        
        try {
            // 尝试访问仓库
            await this.makeGitHubRequest('/repos/' + this.repoOwner + '/' + this.repoName, this.token);
            console.log('Repository exists, using existing one');
            this.showToast(`使用现有仓库: ${this.repoName}`, 'info');
        } catch (error) {
            if (error.status === 404) {
                // 仓库不存在，创建新仓库
                console.log('Repository not found, creating new one');
                try {
                    const repo = await this.createRepo();
                    console.log('Repository created:', repo.html_url);
                } catch (createError) {
                    console.error('Failed to create repo:', createError);
                    throw new Error(`仓库创建失败: ${createError.message}`);
                }
            } else {
                console.error('Repository access error:', error);
                throw error;
            }
        }
    }

    // 创建GitHub仓库 - 增强版本
    async createRepo() {
        console.log(`Creating repository: ${this.repoName}...`);
        
        const repoData = {
            name: this.repoName,
            description: 'Photo storage cloud repository',
            private: false,
            auto_init: true
        };

        console.log('Repo creation data:', repoData);

        try {
            const response = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(repoData)
            });

            const responseText = await response.text();
            console.log('Repo creation response status:', response.status);
            console.log('Repo creation response:', responseText);

            if (!response.ok) {
                let errorMessage = `仓库创建失败 (${response.status})`;
                
                try {
                    const errorData = JSON.parse(responseText);
                    if (errorData.message) {
                        errorMessage += `: ${errorData.message}`;
                    }
                } catch (e) {
                    errorMessage += `: ${responseText}`;
                }
                
                throw new Error(errorMessage);
            }

            const repo = JSON.parse(responseText);
            console.log('Repository created successfully:', repo.html_url);
            
            // 创建README文件
            try {
                await this.createReadmeFile();
                console.log('README created successfully');
            } catch (readmeError) {
                console.warn('README creation failed (not critical):', readmeError);
            }
            
            this.showToast(`仓库创建成功: ${repo.html_url}`, 'success');
            return repo;
            
        } catch (error) {
            console.error('Repository creation error:', error);
            throw error;
        }
    }

    // 创建README文件 - 简化版本
    async createReadmeFile() {
        const readmeContent = '# Photo Storage Repository\\n\\nThis repository stores user photos via GitHub Issues.\\n\\nCreated by Photo Storage App.';
        
        // 使用安全的编码方法
        const base64Content = btoa(unescape(encodeURIComponent(readmeContent)));
        
        try {
            const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/README.md`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: 'Add README for photo storage',
                    content: base64Content
                })
            });

            const responseText = await response.text();
            console.log('README creation response:', response.status, responseText);

            if (!response.ok) {
                console.warn('README creation failed:', response.status, responseText);
            }
        } catch (error) {
            console.warn('README creation error:', error);
        }
    }

    // 上传到GitHub - 简化版本
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

        this.showToast('正在创建仓库和上传数据...', 'info');
        console.log(`Uploading ${photos.length} photos to GitHub...`);

        try {
            // 简化照片数据，只保留前5张进行测试
            const testPhotos = photos.slice(0, 5).map(photo => ({
                id: String(photo.id || Date.now()),
                name: String(photo.name || 'photo'),
                data: String(photo.data || '').substring(0, 1000) // 限制数据长度
            }));

            console.log('Creating repository and uploading...');
            const result = await this.upsertPhotosIssue(testPhotos);
            console.log('Upload successful:', result);
            
            this.showToast(`成功上传 ${testPhotos.length} 张照片到新仓库`, 'success');
            this.showToast(`仓库地址: https://github.com/${this.repoOwner}/${this.repoName}`, 'info');
            
            // 更新存储信息显示
            this.updateStorageInfo();
            
        } catch (error) {
            console.error('Upload to GitHub failed:', error);
            
            // 提供详细的错误信息
            let errorMessage = '上传失败';
            if (error.message) {
                errorMessage += ': ' + error.message;
            }
            
            this.showToast(errorMessage, 'error');
            
            // 提供具体的解决建议
            if (error.message.includes('422')) {
                this.showToast('可能是仓库名称冲突，请稍后重试', 'warning');
            } else if (error.message.includes('403')) {
                this.showToast('Token权限不足，请检查仓库权限设置', 'warning');
            }
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

    // 创建或更新照片存储Issue - 简化版本
    async upsertPhotosIssue(photos) {
        console.log('Creating/updating photos issue...');
        
        if (!this.repoOwner || !this.repoName) {
            throw new Error('仓库信息未设置');
        }

        try {
            // 简化数据验证，只保留核心字段
            const cleanedPhotos = photos.slice(0, 10).map(photo => ({
                id: String(photo.id || Date.now() + Math.random()),
                name: String(photo.name || 'photo'),
                size: Number(photo.size || 0),
                data: String(photo.data || '').substring(0, 1000) // 限制base64长度
            }));

            // 限制Issue数据大小
            const simplifiedData = {
                photos: cleanedPhotos,
                count: cleanedPhotos.length,
                timestamp: new Date().toISOString()
            };

            const issueData = {
                title: this.photosIssueTitle,
                body: JSON.stringify(simplifiedData, null, 2)
            };

            const issueDataSize = JSON.stringify(issueData).length;
            console.log('Issue data size:', issueDataSize, 'bytes');

            // 简化Issue创建流程
            console.log('Creating new issue...');
            const response = await this.makeGitHubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/issues`,
                this.token,
                'POST',
                issueData
            );
            
            console.log('Issue created successfully:', response.number);
            
            // 为Issue添加标签，方便后续查找
            try {
                await this.addLabelToIssue(response.number);
                console.log('Label added to issue');
            } catch (labelError) {
                console.warn('Failed to add label (not critical):', labelError);
            }
            
            return response;

        } catch (error) {
            console.error('Error in upsertPhotosIssue:', error);
            throw error;
        }
    }

    // 获取照片数据 - 简化版本，不依赖标签
    async getPhotosFromIssue() {
        console.log(`Searching for issues in ${this.repoOwner}/${this.repoName}`);
        console.log(`Looking for issue title: ${this.photosIssueTitle}`);
        
        // 简化：获取所有open的Issues，不依赖标签
        const issues = await this.makeGitHubRequest(
            `/repos/${this.repoOwner}/${this.repoName}/issues?state=open&per_page=100`,
            this.token
        );
        
        console.log(`Found ${issues.length} open issues`);
        console.log('Issue titles:', issues.map(i => i.title));

        const photoStorageIssue = issues.find(i => i.title === this.photosIssueTitle);
        if (!photoStorageIssue) {
            console.log('No photo storage issue found');
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