import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'D� x?y ra l?i kh�ng mong mu?n.';
      
      try {
        // Try to parse Firestore JSON error
        const firestoreError = JSON.parse(this.state.error.message);
        if (firestoreError.error) {
          errorMessage = `L?i h? th?ng: ${firestoreError.error}`;
        }
      } catch (e) {
        // Not a Firestore JSON error
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="h-screen flex items-center justify-center bg-[#E4E3E0] p-8">
          <div className="max-w-md w-full p-12 border border-black bg-white shadow-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tighter uppercase italic font-serif mb-4">Th�ng b�o l?i</h2>
            <p className="text-sm opacity-70 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest hover:bg-black/90 transition-colors"
            >
              T?i l?i trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

