class ResponsibleTippingFinder {
    constructor() {
        this.projects = [];
        this.filteredProjects = [];
        this.projectQueue = []; // New: Queue for found projects
        this.isScanning = false; // New: Track scanning state
        this.searchOffset = 0; // New: Track search progression
        this.displayedProjectIds = new Set(); // New: Track displayed projects
        this.pageSize = 12; // New: Projects per "page"
        this.init();
    }

    async init() {
        this.setupEventListeners(); // Move this before loading
        await this.startContinuousSearch();
        this.setupInfiniteScroll(); // New: Setup infinite scroll
    }

    // New: Start continuous search process
    async startContinuousSearch() {
        this.isScanning = true;
        this.showLoadingScreen();
        
        // Start the scanning process
        this.continuousSearch();
    }

    // New: Continuous search that runs in background
    async continuousSearch() {
        while (this.isScanning) {
            try {
                await this.searchBatch();
                
                // Add found projects to display if page has room
                while (this.projectQueue.length > 0 && this.canAddMoreToPage()) {
                    const projectData = this.projectQueue.shift();
                    this.addProjectToDisplay(projectData);
                }
                
                // Hide loading screen once we have some projects
                if (this.filteredProjects.length > 0) {
                    this.hideLoadingScreen();
                }
                
                // Pause if page is full, otherwise continue
                if (!this.canAddMoreToPage()) {
                    this.pauseScanning();
                } else {
                    // Brief pause between searches
                    await this.sleep(1000);
                }
                
            } catch (error) {
                console.error('Error in continuous search:', error);
                await this.sleep(2000); // Wait before retrying
            }
        }
    }

    // New: Search a batch of projects
    async searchBatch() {
        const batchSize = 25;
        const searchTerms = ['game', 'art', 'tool', 'creative', 'portfolio', 'demo', 'experiment', 'design', 'simulator', 'fun', 'interactive', 'visual', 'cool', 'amazing', 'awesome'];
        
        // Rotate through search terms
        const termIndex = Math.floor(this.searchOffset / 2) % searchTerms.length;
        const term = searchTerms[termIndex];
        
        try {
            // Try different feed types
            const feedTypes = ['newest', 'best', 'hot'];
            const feedType = feedTypes[this.searchOffset % feedTypes.length];
            
            let response;
            if (this.searchOffset % 4 === 0) {
                // Every 4th search, use trending
                response = await fetch(`/api/v1/feed/trending?limit=${batchSize}&offset=${Math.floor(this.searchOffset / 4) * batchSize}`);
            } else {
                response = await fetch(`/api/v1/feed/search/${feedType}/${term}?limit=${batchSize}&offset=${Math.floor(this.searchOffset / 3) * batchSize}`);
            }
            
            const data = await response.json();
            const newProjects = data.feed?.data || [];
            
            console.log(`Batch ${this.searchOffset}: Found ${newProjects.length} projects with term "${term}" (${feedType})`);
            
            // Filter this batch
            for (const projectData of newProjects) {
                if (!this.displayedProjectIds.has(projectData.project?.id) && await this.isDeservingProject(projectData)) {
                    this.projectQueue.push(projectData);
                    console.log(`✅ Found deserving project: ${projectData.project.title}`);
                }
            }
            
            this.searchOffset++;
            
        } catch (error) {
            console.error('Error in search batch:', error);
        }
    }

    async loadProjects() {
        try {
            // Get trending projects
            const response = await fetch('/api/v1/feed/trending?limit=50');
            const data = await response.json();
            
            this.projects = data.feed.data;
            console.log(`Loaded ${this.projects.length} projects`);

            // Filter projects based on criteria
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading projects:', error);
            // Fallback to search if trending fails
            await this.loadFromSearch();
        }
    }

    async loadFromSearch() {
        try {
            // Search for various creative terms to find diverse projects
            const searchTerms = ['game', 'art', 'tool', 'creative', 'portfolio', 'demo', 'experiment'];
            const allProjects = [];
            
            for (const term of searchTerms) {
                const response = await fetch(`/api/v1/feed/search/newest/${term}?limit=20`);
                const data = await response.json();
                allProjects.push(...data.feed.data);
            }
            
            this.projects = allProjects;
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading from search:', error);
        }
    }

    async filterDeservingProjects() {
        let filteredProjects = [];
        let attemptCount = 0;
        
        // Try progressively looser filters until we find projects
        while (filteredProjects.length === 0 && attemptCount < 3) {
            filteredProjects = [];
            
            for (const projectData of this.projects) {
                if (await this.isDeservingProject(projectData, attemptCount)) {
                    filteredProjects.push(projectData);
                }
            }
            
            attemptCount++;
            
            // If still no results, try loading more projects
            if (filteredProjects.length === 0 && attemptCount < 3) {
                console.log(`Attempt ${attemptCount}: No projects found, expanding search...`);
                await this.expandSearch();
            }
        }
        
        // Remove duplicates and limit results
        this.filteredProjects = this.removeDuplicates(filteredProjects).slice(0, 12);
        console.log(`Filtered to ${this.filteredProjects.length} deserving projects after ${attemptCount} attempts`);
    }

    async expandSearch() {
        try {
            // Add more search terms for creative projects
            const additionalTerms = ['design', 'simulator', 'fun', 'interactive', 'visual', 'cool', 'amazing', 'awesome'];
            const additionalProjects = [];
            
            for (const term of additionalTerms) {
                const response = await fetch(`/api/v1/feed/search/best/${term}?limit=25`);
                const data = await response.json();
                additionalProjects.push(...data.feed.data);
            }
            
            // Also try getting more from trending with different parameters
            const trendingResponse = await fetch('/api/v1/feed/trending?limit=100&feed=hot');
            const trendingData = await trendingResponse.json();
            additionalProjects.push(...trendingData.feed.data);
            
            this.projects = [...this.projects, ...additionalProjects];
            console.log(`Expanded search to ${this.projects.length} total projects`);
            
        } catch (error) {
            console.error('Error expanding search:', error);
        }
    }

    async isDeservingProject(projectData, filterLevel = 0) {
        const { project, site } = projectData;
        
        if (!project || !site) return false;
        
        // Skip if no title or deleted
        if (!project.title || project.deleted_at) return false;
        
        const title = (project.title || '').toLowerCase();
        const description = (project.description || '').toLowerCase();
        
        // Fetch actual comments to analyze content
        let actualComments = [];
        let commentAnalysis = { hasGamblingContent: false, hasBeggingContent: false, commentCount: 0 };
        
        try {
            const commentsResponse = await fetch(`/api/v1/projects/${project.id}/comments?limit=20`);
            if (commentsResponse.ok) {
                const commentsData = await commentsResponse.json();
                actualComments = commentsData.comments?.data || [];
                commentAnalysis = await this.analyzeComments(actualComments);
            }
        } catch (error) {
            console.log(`Could not fetch comments for project ${project.id}:`, error);
            // Fall back to stats if comment fetching fails
            const stats = project.stats || {};
            commentAnalysis.commentCount = stats.comments || 0;
        }
        
        // If comments contain gambling or begging content, reject
        if (commentAnalysis.hasGamblingContent || commentAnalysis.hasBeggingContent) {
            return false;
        }
        
        // Progressively looser bad keyword filtering
        let badKeywords = [];
        
        if (filterLevel === 0) {
            // Strict filter - only obvious gambling/begging
            badKeywords = [
                'gamble', 'gambling', 'bet', 'betting', 'casino', 'lottery', 
                'jackpot', 'prize money', 'win money', 'pay me now', 'donate money',
                'tip to win', 'tip me please', 'send tips', 'give me credits'
            ];
        } else if (filterLevel === 1) {
            // Moderate filter - only clear gambling terms
            badKeywords = [
                'gamble', 'gambling', 'casino', 'lottery', 'jackpot',
                'tip to win', 'bet money'
            ];
        } else {
            // Loose filter - only obvious scams
            badKeywords = ['scam', 'free money', 'guaranteed win'];
        }
        
        // Check if project contains bad keywords
        const containsBadKeywords = badKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );
        
        if (containsBadKeywords) return false;
        
        // Look for quality indicators with progressively looser criteria
        const stats = project.stats || {};
        const views = stats.views || 0;
        const comments = commentAnalysis.commentCount;
        const likes = stats.likes || 0;
        
        // Progressively looser filtering criteria
        if (filterLevel === 0) {
            // Original strict criteria
            const commentToViewRatio = views > 0 ? comments / views : 0;
            return views > 10 && 
                   views < 10000 && 
                   comments < 50 && 
                   commentToViewRatio < 0.1 && 
                   title.length > 3 && 
                   this.seemsLikeQualityProject(title, description);
        } else if (filterLevel === 1) {
            // Moderate criteria
            return views > 5 && 
                   views < 50000 && 
                   comments < 100 && 
                   likes < 200 &&
                   title.length > 2 && 
                   this.seemsLikeQualityProject(title, description, true);
        } else {
            // Loose criteria - just needs to not be obvious garbage
            return views > 0 && 
                   title.length > 2 && 
                   (this.seemsLikeQualityProject(title, description, true) || 
                    views > 50); // High views indicate some quality
        }
    }

    async analyzeComments(comments) {
        const analysis = {
            hasGamblingContent: false,
            hasBeggingContent: false,
            commentCount: comments.length
        };
        
        const gamblingKeywords = [
            'gamble', 'gambling', 'bet', 'betting', 'casino', 'lottery',
            'jackpot', 'prize money', 'win money', 'tip to win', 'bet money'
        ];
        
        const beggingKeywords = [
            'tip me please', 'send tips', 'give me credits', 'donate money',
            'pay me now', 'need tips', 'tip for more', 'credits please'
        ];
        
        for (const commentData of comments) {
            const comment = commentData.comment;
            if (!comment || !comment.raw_content) continue;
            
            const content = comment.raw_content.toLowerCase();
            
            // Check for gambling content
            if (gamblingKeywords.some(keyword => content.includes(keyword))) {
                analysis.hasGamblingContent = true;
            }
            
            // Check for begging content
            if (beggingKeywords.some(keyword => content.includes(keyword))) {
                analysis.hasBeggingContent = true;
            }
            
            // Early exit if we found problematic content
            if (analysis.hasGamblingContent && analysis.hasBeggingContent) {
                break;
            }
        }
        
        return analysis;
    }

    seemsLikeQualityProject(title, description, relaxed = false) {
        // Look for indicators of quality/effort
        const qualityKeywords = [
            'game', 'art', 'tool', 'portfolio', 'demo', 'experiment', 'creative',
            'interactive', 'animation', 'music', 'sound', 'design', 'code',
            'learn', 'tutorial', 'educational', 'simulation', 'visualization',
            'generator', 'calculator', 'dashboard', 'app', 'website', 'blog',
            'fun', 'cool', 'awesome', 'amazing', 'beautiful', 'simple', 'useful'
        ];
        
        const text = title + ' ' + description;
        
        const hasQualityKeyword = qualityKeywords.some(keyword => text.includes(keyword));
        const hasDecentTitle = title.length > (relaxed ? 5 : 10);
        
        if (relaxed) {
            // More lenient - just needs decent length or quality keyword
            return hasQualityKeyword || hasDecentTitle;
        } else {
            // Original criteria
            return hasQualityKeyword || hasDecentTitle;
        }
    }

    removeDuplicates(projects) {
        const seen = new Set();
        return projects.filter(projectData => {
            const id = projectData.project?.id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    // New: Check if we can add more projects to the current page
    canAddMoreToPage() {
        return this.filteredProjects.length < this.pageSize;
    }

    // New: Add project to display immediately
    addProjectToDisplay(projectData) {
        if (this.displayedProjectIds.has(projectData.project.id)) return;
        
        this.filteredProjects.push(projectData);
        this.displayedProjectIds.add(projectData.project.id);
        
        const grid = document.getElementById('project-grid');
        const card = this.createProjectCard(projectData);
        
        // Remove no-projects message if it exists
        const noProjectsMsg = grid.querySelector('.no-projects-message');
        if (noProjectsMsg) {
            noProjectsMsg.remove();
        }
        
        // Add with animation
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        grid.appendChild(card);
        
        // Animate in
        setTimeout(() => {
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100);
        
        // Update stats
        this.updateStats();
    }

    // New: Setup infinite scroll
    setupInfiniteScroll() {
        let scrollTimeout;
        
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const scrollPosition = window.innerHeight + window.pageYOffset;
                const documentHeight = document.documentElement.offsetHeight;
                
                // If scrolled near bottom (within 1000px)
                if (scrollPosition >= documentHeight - 1000) {
                    this.resumeScanning();
                }
            }, 150);
        });
    }

    // New: Resume scanning when user scrolls
    resumeScanning() {
        if (!this.isScanning) {
            console.log('👀 User scrolled - resuming search...');
            this.isScanning = true;
            this.pageSize += 12; // Increase page size
            
            // Show scanning indicator
            this.showScanningIndicator();
            
            // Resume search
            this.continuousSearch();
        }
    }

    // New: Pause scanning
    pauseScanning() {
        this.isScanning = false;
        this.hideScanningIndicator();
        console.log('⏸️ Page full - pausing search. Scroll down for more!');
    }

    // New: Show scanning indicator
    showScanningIndicator() {
        const grid = document.getElementById('project-grid');
        let indicator = document.getElementById('scanning-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'scanning-indicator';
            indicator.className = 'scanning-indicator';
            indicator.innerHTML = `
                <div class="spinner"></div>
                <p>🔍 Deep scanning for more deserving projects...</p>
            `;
            grid.appendChild(indicator);
        }
        
        indicator.style.display = 'block';
    }

    // New: Hide scanning indicator
    hideScanningIndicator() {
        const indicator = document.getElementById('scanning-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // New: Show loading screen
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const showcase = document.getElementById('project-showcase');
        
        loadingScreen.style.display = 'flex';
        showcase.style.display = 'none';
    }

    // New: Hide loading screen
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const showcase = document.getElementById('project-showcase');
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            showcase.style.display = 'block';
        }, 1000);
    }

    // New: Update stats display
    updateStats() {
        const stats = document.getElementById('filter-stats');
        const totalScanned = this.searchOffset * 25;
        stats.textContent = `Found ${this.filteredProjects.length} deserving projects • Scanned ${totalScanned}+ projects`;
    }

    // New: Utility sleep function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    renderProjects() {
        // This method is now mainly for the refresh button
        const grid = document.getElementById('project-grid');
        
        // Clear grid and reset
        grid.innerHTML = '';
        this.filteredProjects = [];
        this.displayedProjectIds.clear();
        this.projectQueue = [];
        this.searchOffset = 0;
        this.pageSize = 12;
        
        // Restart scanning
        this.startContinuousSearch();
    }

    createProjectCard(projectData) {
        const { project, site } = projectData;
        const stats = project.stats || {};
        
        const card = document.createElement('div');
        card.className = 'project-card';
        
        // Generate thumbnail URL
        const thumbnailUrl = site ? `https://images.websim.com/v1/site/${site.id}/600` : '';
        
        card.innerHTML = `
            <img src="${thumbnailUrl}" alt="Project thumbnail" class="project-thumbnail" 
                 onerror="this.style.display='none'">
            <div class="project-title">${project.title || 'Untitled Project'}</div>
            <div class="project-creator">
                <img src="https://images.websim.com/avatar/${project.created_by?.username || 'anonymous'}" 
                     alt="Creator" class="creator-avatar" onerror="this.style.display='none'">
                <span>@${project.created_by?.username || 'anonymous'}</span>
            </div>
            <div class="project-stats">
                <span>👀 ${stats.views || 0} views</span>
                <span>💬 ${stats.comments || 0} comments</span>
                <span>❤️ ${stats.likes || 0} likes</span>
            </div>
            <div class="support-reason">
                ${this.getSupportReason(stats)}
            </div>
        `;
        
        card.addEventListener('click', () => {
            this.openProject(site, project);
        });
        
        return card;
    }

    getSupportReason(stats) {
        const views = stats.views || 0;
        const comments = stats.comments || 0;
        const likes = stats.likes || 0;
        
        if (views > 1000 && comments < 10) {
            return "🎯 High views, low engagement - needs appreciation!";
        } else if (likes < 10) {
            return "💎 Hidden gem - deserves more recognition!";
        } else if (comments === 0) {
            return "💬 No comments yet - be the first to show support!";
        } else {
            return "⭐ Quality project with room for more support!";
        }
    }

    openProject(site, project) {
        const iframe = document.getElementById('fullscreen-iframe');
        const frame = document.getElementById('project-frame');
        const title = document.querySelector('.iframe-title');
        
        if (site) {
            frame.src = `https://websim.com/c/${site.id}`;
            title.textContent = project.title || 'Untitled Project';
            iframe.style.display = 'block';
        }
    }

    setupEventListeners() {
        const backBtn = document.getElementById('back-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const iframe = document.getElementById('fullscreen-iframe');
        
        backBtn.addEventListener('click', () => {
            iframe.style.display = 'none';
            document.getElementById('project-frame').src = '';
        });
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.textContent = '🔄 Restarting Deep Scan...';
            refreshBtn.disabled = true;
            
            // Stop current scanning
            this.isScanning = false;
            
            await this.sleep(500); // Brief pause
            
            this.renderProjects();
            
            refreshBtn.textContent = '🔄 Restart Deep Scan';
            refreshBtn.disabled = false;
        });
        
        // Close iframe with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && iframe.style.display !== 'none') {
                iframe.style.display = 'none';
                document.getElementById('project-frame').src = '';
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResponsibleTippingFinder();
});