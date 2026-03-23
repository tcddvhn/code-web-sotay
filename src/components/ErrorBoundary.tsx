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
      let errorMessage = 'Đã xảy ra lỗi không mong muốn.';
      
      try {
        // Try to parse Firestore JSON error
        const firestoreError = JSON.parse(this.state.error.message);
        if (firestoreError.error) {
          errorMessage = `Lỗi hệ thống: ${firestoreError.error}`;
        }
      } catch (e) {
        // Not a Firestore JSON error
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="app-shell flex h-screen items-center justify-center p-8">
          <div className="panel-card w-full max-w-md rounded-[28px] p-12 text-center">
            <h2 className="section-title mb-4">Thông báo lỗi</h2>
            <p className="page-subtitle mb-8 text-sm">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="primary-btn px-8 py-3"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
